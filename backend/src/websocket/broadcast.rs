use actix_web::web::Data;
use std::sync::Arc;
use tokio::sync::Mutex;
use super::{ConnectionManager, messages::*};
use serde::Serialize;

/// Broadcast a message to all connections for a specific user
pub async fn broadcast_to_user(
    manager: Data<Arc<Mutex<ConnectionManager>>>,
    user_id: &str,
    event: EventType,
    data: impl Serialize,
) {
    let envelope = WsMessage::new(
        event,
        serde_json::to_value(data).unwrap_or(serde_json::Value::Null),
    );
    
    let manager = manager.as_ref().clone();
    let user_id_owned = user_id.to_string();
    tokio::spawn(async move {
        let manager = manager.lock().await;
        manager.broadcast_to_user(&user_id_owned, envelope);
    });
}

/// Broadcast a stock update
pub async fn broadcast_stock_update(
    manager: Data<Arc<Mutex<ConnectionManager>>>,
    user_id: &str,
    event: &str,
    stock: impl Serialize,
) {
    let event_type = match event {
        "created" => EventType::StockCreated,
        "updated" => EventType::StockUpdated,
        "deleted" => EventType::StockDeleted,
        _ => return,
    };
    
    broadcast_to_user(manager, user_id, event_type, stock).await;
}

/// Broadcast an option update
pub async fn broadcast_option_update(
    manager: Data<Arc<Mutex<ConnectionManager>>>,
    user_id: &str,
    event: &str,
    option: impl Serialize,
) {
    let event_type = match event {
        "created" => EventType::OptionCreated,
        "updated" => EventType::OptionUpdated,
        "deleted" => EventType::OptionDeleted,
        _ => return,
    };
    
    broadcast_to_user(manager, user_id, event_type, option).await;
}

/// Broadcast a note update
#[allow(dead_code)]
pub async fn broadcast_note_update(
    manager: Data<Arc<Mutex<ConnectionManager>>>,
    user_id: &str,
    event: &str,
    note: impl Serialize,
) {
    #[allow(unused_variables)]
    let event_type = match event {
        "created" => EventType::NoteCreated,
        "updated" => EventType::NoteUpdated,
        "deleted" => EventType::NoteDeleted,
        _ => return,
    };
    
    broadcast_to_user(manager, user_id, event_type, note).await;
}

/// Broadcast a playbook update
#[allow(dead_code)]
pub async fn broadcast_playbook_update(
    manager: Data<Arc<Mutex<ConnectionManager>>>,
    user_id: &str,
    event: &str,
    playbook: impl Serialize,
) {
    #[allow(unused_variables)]
    let event_type = match event {
        "created" => EventType::PlaybookCreated,
        "updated" => EventType::PlaybookUpdated,
        "deleted" => EventType::PlaybookDeleted,
        _ => return,
    };
    
    broadcast_to_user(manager, user_id, event_type, playbook).await;
}

