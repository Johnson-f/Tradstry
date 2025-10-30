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
    pub change: serde_json::Value, // Can be string like "+1.00" or number
    #[serde(rename = "percentChange")]
    pub percent_change: serde_json::Value, // Can be string like "+0.69%" or number
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
                        // Reset sender on disconnect
                        *upstream_sender.lock().await = None;
                    }
                    Err(e) => {
                        consecutive_failures += 1;
                        // Only log as error on first failure, then warn for subsequent failures
                        if consecutive_failures == 1 {
                            error!("Market WebSocket proxy connection failed: {}. Will retry...", e);
                        } else if consecutive_failures % 10 == 0 {
                            // Log every 10th failure to avoid spam
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
        _api_key: Option<&str>, // Currently unused - FinanceQuery instance may not require auth
        subscriptions: Arc<DashMap<String, DashMap<String, bool>>>,
        manager: Arc<Mutex<ConnectionManager>>,
        upstream_sender: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>>,
    ) -> Result<()> {
        // Build WS URL - FinanceQuery uses /quotes endpoint for real-time quotes
        let ws_url = base_url
            .replace("https://", "wss://")
            .replace("http://", "ws://");
        let url = format!("{}/quotes", ws_url);

        info!("Connecting to FinanceQuery WebSocket: {}", url);

        // Connect to upstream WebSocket
        let (mut ws_stream, _) = connect_async(&url)
            .await
            .context("Failed to connect to FinanceQuery WebSocket")?;

        info!("Connected to FinanceQuery WebSocket");

        // FinanceQuery /quotes endpoint expects a comma-separated list of symbols as plain text
        // Collect all unique symbols we need to subscribe to
        let active_symbols: Vec<String> = subscriptions.iter().map(|entry| entry.key().clone()).collect();
        
        if !active_symbols.is_empty() {
            // Send comma-separated symbols as plain text (not JSON)
            let symbol_list = active_symbols.join(",");
            info!("Sending subscription for symbols: {}", symbol_list);
            ws_stream.send(WsMessage::Text(symbol_list)).await?;
        }

        // Set up channel for sending subscription commands
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        *upstream_sender.lock().await = Some(tx);

        // Process messages from both upstream and subscription commands
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
                        Some(Ok(_)) => {} // Ignore binary/ping/pong
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
                            // FinanceQuery expects comma-separated symbol list as plain text
                            info!("Updating subscription on upstream: {}", symbol_list);
                            if let Err(e) = ws_stream.send(WsMessage::Text(symbol_list)).await {
                                error!("Failed to send subscription update: {}", e);
                                break;
                            }
                        }
                        None => {
                            // Channel closed
                            break;
                        }
                    }
                }
            }
        }

        // Clear sender on disconnect
        *upstream_sender.lock().await = None;
        Ok(())
    }

    /// Handle incoming message from upstream
    /// FinanceQuery sends arrays with metadata as first element, followed by quote objects
    async fn handle_upstream_message(
        text: &str,
        subscriptions: Arc<DashMap<String, DashMap<String, bool>>>,
        manager: Arc<Mutex<ConnectionManager>>,
    ) -> Result<()> {
        // Parse as array of JSON values first
        match serde_json::from_str::<Vec<serde_json::Value>>(text) {
            Ok(values) => {
                // Filter out metadata objects and parse only quote objects
                let mut quotes = Vec::new();
                
                for value in values {
                    // Check if this is a quote object (has "symbol" field)
                    // Metadata objects have "metadata" field instead
                    if value.get("symbol").is_some() {
                        match serde_json::from_value::<QuoteUpdate>(value) {
                            Ok(quote) => quotes.push(quote),
                            Err(e) => {
                                warn!("Failed to parse quote object: {}", e);
                            }
                        }
                    }
                    // Skip metadata objects silently
                }
                
                // Broadcast each quote to all subscribed users for that symbol
                if !quotes.is_empty() {
                    let manager = manager.lock().await;
                    
                    for quote in quotes {
                        let symbol = quote.symbol.clone();
                        
                        // Find all users subscribed to this symbol
                        if let Some(user_set) = subscriptions.get(&symbol) {
                            let user_ids: Vec<String> = user_set.iter().map(|entry| entry.key().clone()).collect();
                            
                            // Broadcast to all subscribed users
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
                // Log unrecognized messages for debugging
                warn!("Failed to parse upstream message as JSON array: {} - Error: {}", text, e);
            }
        }

        Ok(())
    }

    /// Send subscription update to upstream connection
    /// FinanceQuery requires sending the full comma-separated list of all active symbols
    fn build_symbol_list(subscriptions: &DashMap<String, DashMap<String, bool>>) -> String {
        let symbols: Vec<String> = subscriptions.iter().map(|entry| entry.key().clone()).collect();
        symbols.join(",")
    }

    /// Subscribe a user to market updates for symbols
    pub async fn subscribe(&self, user_id: &str, symbols: &[String]) -> Result<()> {
        let mut new_symbols = Vec::new();
        
        for symbol in symbols {
            let sym_upper = symbol.to_uppercase();
            
            // Check if this is a new symbol (no users subscribed yet)
            let is_new = !self.subscriptions.contains_key(&sym_upper);
            
            // Add user to symbol's subscription set
            self.subscriptions
                .entry(sym_upper.clone())
                .or_insert_with(DashMap::new)
                .insert(user_id.to_string(), true);

            // Add symbol to user's subscription set
            self.user_symbols
                .entry(user_id.to_string())
                .or_insert_with(DashMap::new)
                .insert(sym_upper.clone(), true);

            if is_new {
                new_symbols.push(sym_upper.clone());
            }

            info!("User {} subscribed to symbol {}", user_id, sym_upper);
        }

        // Send updated symbol list to upstream for new subscriptions
        // FinanceQuery requires the full list of all active symbols, not individual subscribes
        if !new_symbols.is_empty() {
            if let Some(sender) = self.upstream_sender.lock().await.as_ref() {
                let all_symbols = Self::build_symbol_list(&self.subscriptions);
                if let Err(e) = sender.send(all_symbols) {
                    warn!("Failed to send subscription update: {}", e);
                }
            }
        }

        Ok(())
    }

    /// Unsubscribe a user from market updates for symbols
    pub async fn unsubscribe(&self, user_id: &str, symbols: &[String]) -> Result<()> {
        let mut symbols_removed = Vec::new();
        
        for symbol in symbols {
            let sym_upper = symbol.to_uppercase();

            // Remove user from symbol's subscription set
            if let Some(user_set) = self.subscriptions.get_mut(&sym_upper) {
                user_set.remove(user_id);
                if user_set.is_empty() {
                    drop(user_set);
                    self.subscriptions.remove(&sym_upper);
                    symbols_removed.push(sym_upper.clone());
                }
            }

            // Remove symbol from user's subscription set
            if let Some(symbol_set) = self.user_symbols.get_mut(user_id) {
                symbol_set.remove(&sym_upper);
            }

            info!("User {} unsubscribed from symbol {}", user_id, sym_upper);
        }

        // Update upstream subscription if any symbols were fully removed
        if !symbols_removed.is_empty() {
            if let Some(sender) = self.upstream_sender.lock().await.as_ref() {
                let all_symbols = Self::build_symbol_list(&self.subscriptions);
                // If we still have subscriptions, send updated list; otherwise empty list clears subscription
                if let Err(e) = sender.send(all_symbols) {
                    warn!("Failed to send unsubscription update: {}", e);
                }
            }
        }

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

