//! WebSocket proxy for FinanceQuery streaming quotes.
//! Maintains upstream WS connection, manages symbol subscriptions,
//! and fans out updates to frontend clients via ConnectionManager.

use std::sync::Arc;
use std::time::Duration;
use dashmap::DashMap;
use anyhow::{Context, Result};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};
use futures_util::{SinkExt, StreamExt};

use crate::websocket::{ConnectionManager, WsMessage as AppWsMessage, EventType};

/// Quote update from upstream FinanceQuery (SimpleQuote format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteUpdate {
    pub symbol: String,
    pub name: String,
    pub price: String,
    #[serde(rename = "preMarketPrice")]
    pub pre_market_price: Option<String>,
    #[serde(rename = "afterHoursPrice")]
    pub after_hours_price: Option<String>,
    #[serde(alias = "change")]
    pub change: serde_json::Value,
    #[serde(rename = "percentChange")]
    pub percent_change: serde_json::Value,
    pub logo: Option<String>,
}

/// Manages WebSocket proxy for market data streaming
pub struct MarketWsProxy {
    manager: Arc<Mutex<ConnectionManager>>,
    base_url: String,
    api_key: Option<String>,
    /// Maps symbol -> Set of user_ids subscribed to it
    subscriptions: Arc<DashMap<String, DashMap<String, bool>>>,
    /// Maps user_id -> Set of symbols they're subscribed to
    user_symbols: Arc<DashMap<String, DashMap<String, bool>>>,
    /// Channel to send subscription commands to upstream connection
    upstream_sender: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>>,
    upstream_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    /// Flag to indicate pending subscription update (for debouncing)
    pending_update: Arc<Mutex<bool>>,
}

impl MarketWsProxy {
    pub fn new(
        manager: Arc<Mutex<ConnectionManager>>,
        base_url: String,
        api_key: Option<String>,
    ) -> Self {
        Self {
            manager,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            subscriptions: Arc::new(DashMap::new()),
            user_symbols: Arc::new(DashMap::new()),
            upstream_sender: Arc::new(Mutex::new(None)),
            upstream_handle: Arc::new(Mutex::new(None)),
            pending_update: Arc::new(Mutex::new(false)),
        }
    }

    /// Start the upstream WebSocket connection and message loop
    pub async fn start(&self) -> Result<()> {
        let base_url = self.base_url.clone();
        let api_key = self.api_key.clone();
        let subscriptions = self.subscriptions.clone();
        let manager = self.manager.clone();
        let upstream_sender = self.upstream_sender.clone();

        let handle = tokio::spawn(async move {
            let mut reconnect_delay = Duration::from_secs(1);
            let max_delay = Duration::from_secs(60);
            let mut consecutive_failures = 0;

            loop {
                match Self::connect_and_stream(&base_url, api_key.as_deref(), subscriptions.clone(), manager.clone(), upstream_sender.clone()).await {
                    Ok(_) => {
                        info!("Market WebSocket proxy connection closed normally");
                        reconnect_delay = Duration::from_secs(1);
                        consecutive_failures = 0;
                        *upstream_sender.lock().await = None;
                    }
                    Err(e) => {
                        consecutive_failures += 1;
                        if consecutive_failures == 1 {
                            error!("Market WebSocket proxy connection failed: {}. Will retry...", e);
                        } else if consecutive_failures % 10 == 0 {
                            warn!("Market WebSocket proxy still failing after {} attempts. Last error: {}. Reconnecting in {:?}...", 
                                  consecutive_failures, e, reconnect_delay);
                        }
                        *upstream_sender.lock().await = None;
                        tokio::time::sleep(reconnect_delay).await;
                        reconnect_delay = (reconnect_delay * 2).min(max_delay);
                    }
                }
            }
        });

        *self.upstream_handle.lock().await = Some(handle);
        Ok(())
    }

    /// Connect to FinanceQuery WebSocket and process messages
    async fn connect_and_stream(
        base_url: &str,
        _api_key: Option<&str>,
        subscriptions: Arc<DashMap<String, DashMap<String, bool>>>,
        manager: Arc<Mutex<ConnectionManager>>,
        upstream_sender: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>>,
    ) -> Result<()> {
        let ws_url = base_url
            .replace("https://", "wss://")
            .replace("http://", "ws://");
        let url = format!("{}/quotes", ws_url);

        info!("Connecting to FinanceQuery WebSocket: {}", url);

        let (mut ws_stream, _) = connect_async(&url)
            .await
            .context("Failed to connect to FinanceQuery WebSocket")?;

        info!("Connected to FinanceQuery WebSocket");

        let active_symbols: Vec<String> = subscriptions.iter().map(|entry| entry.key().clone()).collect();
        
        if !active_symbols.is_empty() {
            let symbol_list = active_symbols.join(",");
            info!("Sending subscription for symbols: {}", symbol_list);
            ws_stream.send(WsMessage::Text(symbol_list)).await?;
        }

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        *upstream_sender.lock().await = Some(tx);

        loop {
            tokio::select! {
                msg = ws_stream.next() => {
                    match msg {
                        Some(Ok(WsMessage::Text(text))) => {
                            if let Err(e) = Self::handle_upstream_message(&text, subscriptions.clone(), manager.clone()).await {
                                error!("Error handling upstream message: {}", e);
                            }
                        }
                        Some(Ok(WsMessage::Close(_))) => {
                            info!("Upstream WebSocket closed");
                            break;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(e)) => {
                            return Err(anyhow::anyhow!("WebSocket stream error: {}", e));
                        }
                        None => {
                            info!("Upstream WebSocket stream ended");
                            break;
                        }
                    }
                }
                cmd = rx.recv() => {
                    match cmd {
                        Some(symbol_list) => {
                            info!("Sending subscription update to upstream: {}", symbol_list);
                            if let Err(e) = ws_stream.send(WsMessage::Text(symbol_list)).await {
                                error!("Failed to send subscription update: {}", e);
                                break;
                            }
                        }
                        None => {
                            break;
                        }
                    }
                }
            }
        }

        *upstream_sender.lock().await = None;
        Ok(())
    }

    /// Handle incoming message from upstream
    async fn handle_upstream_message(
        text: &str,
        subscriptions: Arc<DashMap<String, DashMap<String, bool>>>,
        manager: Arc<Mutex<ConnectionManager>>,
    ) -> Result<()> {
        match serde_json::from_str::<Vec<serde_json::Value>>(text) {
            Ok(values) => {
                let mut quotes = Vec::new();
                
                for value in values {
                    if value.get("symbol").is_some() {
                        match serde_json::from_value::<QuoteUpdate>(value) {
                            Ok(quote) => quotes.push(quote),
                            Err(e) => {
                                warn!("Failed to parse quote object: {}", e);
                            }
                        }
                    }
                }
                
                if !quotes.is_empty() {
                    let manager = manager.lock().await;
                    
                    for quote in quotes {
                        let symbol = quote.symbol.clone();
                        
                        if let Some(user_set) = subscriptions.get(&symbol) {
                            let user_ids: Vec<String> = user_set.iter().map(|entry| entry.key().clone()).collect();
                            
                            let message = AppWsMessage::new(
                                EventType::MarketQuote,
                                serde_json::to_value(&quote)?,
                            );
                            
                            for user_id in user_ids {
                                manager.broadcast_to_user(&user_id, message.clone());
                            }
                        }
                    }
                }
            }
            Err(e) => {
                warn!("Failed to parse upstream message as JSON array: {} - Error: {}", text, e);
            }
        }

        Ok(())
    }

    /// Build comma-separated symbol list from all active subscriptions
    fn build_symbol_list(subscriptions: &DashMap<String, DashMap<String, bool>>) -> String {
        let symbols: Vec<String> = subscriptions.iter().map(|entry| entry.key().clone()).collect();
        symbols.join(",")
    }

    /// Send debounced subscription update to upstream
    /// This prevents rapid subscribe/unsubscribe from sending multiple updates
    async fn schedule_subscription_update(&self) {
        let mut pending = self.pending_update.lock().await;
        
        // If already pending, don't schedule another
        if *pending {
            return;
        }
        
        *pending = true;
        drop(pending);

        // Clone needed values for the spawned task
        let subscriptions = self.subscriptions.clone();
        let upstream_sender = self.upstream_sender.clone();
        let pending_update = self.pending_update.clone();

        // Wait 100ms to batch rapid changes, then send single update
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            
            if let Some(sender) = upstream_sender.lock().await.as_ref() {
                let all_symbols = Self::build_symbol_list(&subscriptions);
                info!("Debounced update - sending symbols to upstream: {}", all_symbols);
                if let Err(e) = sender.send(all_symbols) {
                    warn!("Failed to send debounced subscription update: {}", e);
                }
            }
            
            *pending_update.lock().await = false;
        });
    }

    /// Subscribe a user to market updates for symbols
    pub async fn subscribe(&self, user_id: &str, symbols: &[String]) -> Result<()> {
        for symbol in symbols {
            let sym_upper = symbol.to_uppercase();
            
            self.subscriptions
                .entry(sym_upper.clone())
                .or_insert_with(DashMap::new)
                .insert(user_id.to_string(), true);

            self.user_symbols
                .entry(user_id.to_string())
                .or_insert_with(DashMap::new)
                .insert(sym_upper.clone(), true);

            info!("User {} subscribed to symbol {}", user_id, sym_upper);
        }

        // Schedule debounced update instead of immediate update
        self.schedule_subscription_update().await;
        Ok(())
    }

    /// Unsubscribe a user from market updates for symbols
    pub async fn unsubscribe(&self, user_id: &str, symbols: &[String]) -> Result<()> {
        for symbol in symbols {
            let sym_upper = symbol.to_uppercase();

            if let Some(user_set) = self.subscriptions.get_mut(&sym_upper) {
                user_set.remove(user_id);
                if user_set.is_empty() {
                    drop(user_set);
                    self.subscriptions.remove(&sym_upper);
                }
            }

            if let Some(symbol_set) = self.user_symbols.get_mut(user_id) {
                symbol_set.remove(&sym_upper);
            }

            info!("User {} unsubscribed from symbol {}", user_id, sym_upper);
        }

        // Schedule debounced update instead of immediate update
        self.schedule_subscription_update().await;
        Ok(())
    }

    /// Get all symbols a user is subscribed to
    pub fn get_user_subscriptions(&self, user_id: &str) -> Vec<String> {
        self.user_symbols
            .get(user_id)
            .map(|entry| entry.iter().map(|e| e.key().clone()).collect())
            .unwrap_or_default()
    }
}