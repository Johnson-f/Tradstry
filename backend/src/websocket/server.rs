use actix_web::{
    web::{Data, Payload},
    HttpRequest, HttpResponse, Result,
};
use actix_ws::{handle, Message};
use futures_util::StreamExt;
use log::{error, info, warn};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::manager::ConnectionManager;
use crate::turso::validate_jwt_token_from_query;
use crate::service::market_engine::ws_proxy::MarketWsProxy;

/// Subscribe/unsubscribe message from client
#[derive(Debug, Deserialize)]
struct SubscribeMessage {
    #[serde(rename = "type")]
    message_type: String,
    symbols: Vec<String>,
}

/// WebSocket connection info
pub struct WsConnection {
    #[allow(dead_code)]
    user_id: String,
    #[allow(dead_code)]
    manager: Arc<Mutex<ConnectionManager>>,
    sender: tokio::sync::mpsc::UnboundedSender<String>,
}

impl WsConnection {
    #[allow(dead_code)]
    pub fn new(user_id: String, manager: Arc<Mutex<ConnectionManager>>) -> Self {
        let (sender, _receiver) = tokio::sync::mpsc::unbounded_channel();
        Self {
            user_id,
            manager,
            sender,
        }
    }
}

/// Start WebSocket endpoint handler
pub async fn ws_handler(
    req: HttpRequest,
    stream: Payload,
    manager: Data<Arc<Mutex<ConnectionManager>>>,
    market_proxy: Data<Arc<MarketWsProxy>>,
) -> Result<HttpResponse> {
    // Extract and validate JWT token from query parameters
    let token = req
        .uri()
        .query()
        .and_then(|q| {
            q.split('&')
                .find(|pair| pair.starts_with("token="))
                .and_then(|pair| pair.split('=').nth(1))
        });

    let token = match token {
        Some(t) => t,
        None => return Ok(HttpResponse::Unauthorized().body("Missing authentication token")),
    };

    // Validate JWT token
    let claims = validate_jwt_token_from_query(token)
        .await
        .map_err(|e| actix_web::error::ErrorUnauthorized(e.to_string()))?;

    let user_id = claims.sub.clone();
    info!("WebSocket connection established for user: {}", user_id);

    // Handle WebSocket connection using actix-ws
    let manager = manager.as_ref().clone();
    let market_proxy = market_proxy.as_ref().clone();
    let (res, session, mut msg_stream) = handle(&req, stream)?;

    // Create a channel for sending messages to this client
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Register this connection with the manager
    {
        let manager = manager.lock().await;
        manager.register(user_id.clone(), tx.clone());
    }

    // Spawn handler for this connection
    actix_web::rt::spawn(async move {
        // Spawn task to send messages from manager to client
        let user_id_send = user_id.clone();
        let mut session_send = session;
        let send_task = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = session_send.text(msg).await {
                    error!("Failed to send message to client {}: {}", user_id_send, e);
                    break;
                }
            }
        });

        // Handle incoming messages
        while let Some(msg_result) = msg_stream.next().await {
            match msg_result {
                Ok(msg) => match msg {
                    Message::Text(text) => {
                        info!("Received text message from {}: {}", user_id, text);
                        
                        // Parse subscribe/unsubscribe messages
                        match serde_json::from_str::<SubscribeMessage>(&text) {
                            Ok(sub_msg) => {
                                match sub_msg.message_type.as_str() {
                                    "subscribe" => {
                                        info!("User {} subscribing to symbols: {:?}", user_id, sub_msg.symbols);
                                        if let Err(e) = market_proxy.subscribe(&user_id, &sub_msg.symbols).await {
                                            error!("Failed to subscribe user {}: {}", user_id, e);
                                        }
                                    }
                                    "unsubscribe" => {
                                        info!("User {} unsubscribing from symbols: {:?}", user_id, sub_msg.symbols);
                                        if let Err(e) = market_proxy.unsubscribe(&user_id, &sub_msg.symbols).await {
                                            error!("Failed to unsubscribe user {}: {}", user_id, e);
                                        }
                                    }
                                    _ => {
                                        warn!("Unknown message type from {}: {}", user_id, sub_msg.message_type);
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse message from {}: {} - {}", user_id, text, e);
                            }
                        }
                    }
                    Message::Binary(_bin) => {
                        info!("Received binary message from {}", user_id);
                    }
                    Message::Close(reason) => {
                        info!("WebSocket connection closing: {:?}", reason);
                        break;
                    }
                    _ => {}
                },
                Err(e) => {
                    error!("WebSocket error for {}: {:?}", user_id, e);
                    break;
                }
            }
        }

        // Unsubscribe from all symbols on disconnect
        let symbols = market_proxy.get_user_subscriptions(&user_id);
        if !symbols.is_empty() {
            if let Err(e) = market_proxy.unsubscribe(&user_id, &symbols).await {
                error!("Failed to unsubscribe user {} on disconnect: {}", user_id, e);
            }
        }

        // Unregister connection
        let manager_unreg = manager.lock().await;
        manager_unreg.unregister(&user_id, &tx);
        drop(manager_unreg);

        // Cancel send task
        send_task.abort();

        info!("WebSocket connection unregistered for user: {}", user_id);
    });

    Ok(res)
}

/// Send a message to a WebSocket connection
#[allow(dead_code)]
pub async fn send_to_connection(conn: &WsConnection, message: String) {
    let _ = conn.sender.send(message);
}
