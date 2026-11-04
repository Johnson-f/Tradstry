//! Real-time change feed. Database triggers announce every user-visible write
//! on their schema's Postgres channel; the hub listens on its schema's channel
//! and fans the changes out to each signed-in user's open subscriptions.

use std::{
    sync::{Arc, Weak},
    time::Duration,
};

use async_graphql::Enum;
use serde::Deserialize;
use sqlx::{PgPool, postgres::PgListener};
use tokio::sync::{OnceCell, broadcast};
use tracing::warn;
use uuid::Uuid;

/// The channel a schema's triggers notify: one per schema, so environments
/// sharing a database never hear each other.
pub fn channel(schema: &str) -> String {
    format!("tradstry_changes_{schema}")
}
/// Changes buffered per subscriber before it falls behind and is told to resync.
const BUFFER: usize = 1024;
/// How often an idle listener checks whether its hub is gone.
const IDLE_CHECK: Duration = Duration::from_secs(30);

/// What changed. Each maps to the data an app should refetch.
#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeTopic {
    /// Trades and everything computed from them: positions, issues, statistics.
    Trades,
    /// Journal entries on trades.
    Journal,
    Labels,
    Plans,
    Settings,
    /// Workspaces, including their position calculator rule.
    Workspaces,
    /// Brokerage connections, accounts, imports and holdings.
    Brokerage,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
pub struct Change {
    #[serde(rename = "u")]
    pub user_id: Uuid,
    #[serde(rename = "w")]
    pub workspace_id: Option<Uuid>,
    #[serde(rename = "t")]
    pub topic: ChangeTopic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Change(Change),
    /// Changes may have been missed, so everything should be refetched.
    Resync,
}

struct Inner {
    pool: PgPool,
    sender: broadcast::Sender<Event>,
    listening: OnceCell<()>,
}

/// Cheap to create: the listener connection only opens on the first subscribe.
#[derive(Clone)]
pub struct Hub(Arc<Inner>);

impl Hub {
    pub fn new(pool: PgPool) -> Self {
        let (sender, _) = broadcast::channel(BUFFER);
        Self(Arc::new(Inner {
            pool,
            sender,
            listening: OnceCell::new(),
        }))
    }

    pub async fn subscribe(&self) -> broadcast::Receiver<Event> {
        let receiver = self.0.sender.subscribe();
        self.0
            .listening
            .get_or_init(|| async {
                let ready = connect(&self.0.pool).await;
                tokio::spawn(listen(Arc::downgrade(&self.0), ready));
            })
            .await;
        receiver
    }
}

/// Listens on the channel of the schema the pool's sessions use.
async fn connect(pool: &PgPool) -> Option<PgListener> {
    let mut listener = PgListener::connect_with(pool).await.ok()?;
    let schema: String = sqlx::query_scalar("SELECT current_schema()")
        .fetch_one(&mut listener)
        .await
        .ok()?;
    listener.listen(&channel(&schema)).await.ok()?;
    Some(listener)
}

/// Runs until the hub is dropped, starting from the listener `subscribe`
/// connected so the first subscriber misses nothing. Whenever the connection
/// drops, subscribers are told to resync: notifications sent meanwhile are lost.
async fn listen(hub: Weak<Inner>, mut ready: Option<PgListener>) {
    let mut backoff = Duration::from_millis(250);
    let mut first = ready.is_some();
    loop {
        let Some(pool) = hub.upgrade().map(|inner| inner.pool.clone()) else {
            return;
        };
        let connected = match ready.take() {
            Some(listener) => Some(listener),
            None => connect(&pool).await,
        };
        let Some(mut listener) = connected else {
            warn!("could not listen for changes; retrying");
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(30));
            continue;
        };
        backoff = Duration::from_millis(250);
        if !std::mem::take(&mut first)
            && let Some(inner) = hub.upgrade()
        {
            let _ = inner.sender.send(Event::Resync);
        }
        loop {
            let received = tokio::time::timeout(IDLE_CHECK, listener.try_recv()).await;
            let Some(inner) = hub.upgrade() else { return };
            match received {
                Err(_) => continue,
                Ok(Ok(Some(notification))) => {
                    match serde_json::from_str::<Change>(notification.payload()) {
                        Ok(change) => {
                            let _ = inner.sender.send(Event::Change(change));
                        }
                        Err(error) => warn!(%error, "ignored a malformed change notification"),
                    }
                }
                Ok(Ok(None)) => {
                    warn!("lost the change listener connection; reconnecting");
                    let _ = inner.sender.send(Event::Resync);
                }
                Ok(Err(error)) => {
                    warn!(%error, "change listener failed; reconnecting");
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notifications_parse_into_changes() {
        let change: Change = serde_json::from_str(
            r#"{"u": "0190a0a0-0000-7000-8000-000000000001", "w": null, "t": "trades"}"#,
        )
        .unwrap();
        assert_eq!(change.topic, ChangeTopic::Trades);
        assert_eq!(change.workspace_id, None);
    }
}
