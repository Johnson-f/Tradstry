use actix_web::{
    web::{Data, Payload},
    HttpRequest, HttpResponse, Result,
};
use actix_ws::{handle, CloseCode, Message};
use futures_util::StreamExt;
use log::{error, info};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::manager::ConnectionManager;
// no messages are needed directly here
use crate::turso::validate_jwt_token_from_query;

/// WebSocket connection info
#[allow(dead_code)]
pub struct WsConnection {
    user_id: String,
    manager: Arc<Mutex<ConnectionManager>>,
    sender: tokio::sync::mpsc::UnboundedSender<String>,
}

impl WsConnection {
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
    let (res, mut session, mut msg_stream) = handle(&req, stream)?;

    // Spawn handler for this connection
    actix_web::rt::spawn(async move {
        let _conn = WsConnection::new(user_id.clone(), manager.clone());

        // Handle incoming messages
        while let Some(msg_result) = msg_stream.next().await {
            match msg_result {
                Ok(msg) => match msg {
                    Message::Text(text) => {
                        info!("Received text message from {}: {}", user_id, text);
                        // Echo back for now
                        let _ = session.text(text).await;
                    }
                    Message::Binary(bin) => {
                        info!("Received binary message from {}", user_id);
                        let _ = session.binary(bin).await;
                    }
                    Message::Close(reason) => {
                        info!("WebSocket connection closing: {:?}", reason);
                        break;
                    }
                    _ => {}
                },
                Err(e) => {
                    error!("WebSocket error for {}: {:?}", user_id, e);
                    let _ = session
                        .close(Some(actix_ws::CloseReason {
                            code: CloseCode::Error,
                            description: Some("Internal error".into()),
                        }))
                        .await;
                    break;
                }
            }
        }

        // Unregister on disconnect
        info!("WebSocket connection unregistered for user: {}", user_id);
    });

    Ok(res)
}

/// Send a message to a WebSocket connection
#[allow(dead_code)]
pub async fn send_to_connection(conn: &WsConnection, message: String) {
    let _ = conn.sender.send(message);
}
