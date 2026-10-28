//! SnapTrade webhooks: verified, stored once per `webhookId`, acknowledged,
//! then processed from the database so a crash or error is retried rather
//! than lost.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::Value;
use sha2::Sha256;
use sqlx::PgPool;
use subtle::ConstantTimeEq;
use tracing::{info, warn};
use uuid::Uuid;

use super::Brokerage;
use super::import::JobKind;
use super::store;
use crate::snaptrade::signing::canonical_json;

/// Duplicates are dropped by `webhookId`, so the age limit only has to cover
/// SnapTrade's retries (three, with backoff from 30 minutes) of a signed body.
const MAX_AGE: Duration = Duration::hours(24);
const MAX_FUTURE_SKEW: Duration = Duration::seconds(60);
const MAX_ATTEMPTS: i32 = 8;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum WebhookError {
    #[error("invalid signature")]
    Signature,
    #[error("malformed webhook: {0}")]
    Malformed(&'static str),
    #[error("webhook timestamp is outside the accepted window")]
    Stale,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WebhookEvent {
    pub webhook_id: String,
    pub event_type: String,
    pub timestamp: DateTime<Utc>,
    /// The Commercial SnapTrade user, or the Personal user for OAuth events.
    pub snaptrade_user_id: Option<String>,
    /// Present only on OAuth (`oauth_v1`) events.
    pub oauth_client_id: Option<String>,
    pub connection_id: Option<String>,
    pub account_id: Option<String>,
    pub payload: Value,
}

fn text(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::to_owned)
        .filter(|value| !value.is_empty())
}

/// The `Signature` header is base64 HMAC-SHA256, keyed with the consumer key,
/// of the payload. SnapTrade's reference serializes the parsed JSON with sorted
/// keys and compact separators; the raw body and the non-ASCII-escaped form
/// are accepted too so a formatting difference can never drop a real event.
pub fn verify(
    body: &[u8],
    signature: &str,
    consumer_key: &str,
    now: DateTime<Utc>,
) -> Result<WebhookEvent, WebhookError> {
    let provided = STANDARD
        .decode(signature.trim())
        .map_err(|_| WebhookError::Signature)?;
    let payload: Value =
        serde_json::from_slice(body).map_err(|_| WebhookError::Malformed("body is not JSON"))?;
    let candidates = [
        body.to_vec(),
        canonical_json(&payload, false).into_bytes(),
        canonical_json(&payload, true).into_bytes(),
    ];
    let matched = candidates.iter().any(|candidate| {
        let mut mac = Hmac::<Sha256>::new_from_slice(consumer_key.as_bytes())
            .expect("HMAC takes any key length");
        mac.update(candidate);
        bool::from(mac.finalize().into_bytes().as_slice().ct_eq(&provided))
    });
    if !matched {
        return Err(WebhookError::Signature);
    }

    let webhook_id =
        text(&payload, &["webhookId"]).ok_or(WebhookError::Malformed("no webhookId"))?;
    let event_type = text(&payload, &["eventType", "webhookType", "type"])
        .ok_or(WebhookError::Malformed("no eventType"))?
        .to_ascii_uppercase();
    let timestamp = text(&payload, &["eventTimestamp"])
        .and_then(|value| DateTime::parse_from_rfc3339(&value).ok())
        .ok_or(WebhookError::Malformed("no eventTimestamp"))?
        .with_timezone(&Utc);
    if timestamp > now + MAX_FUTURE_SKEW || timestamp < now - MAX_AGE {
        return Err(WebhookError::Stale);
    }
    let mut payload = payload;
    // Older SnapTrade webhooks carry the client's webhook secret in the body;
    // it has no business sitting in the events table.
    if let Some(fields) = payload.as_object_mut() {
        fields.remove("webhookSecret");
    }
    Ok(WebhookEvent {
        snaptrade_user_id: text(&payload, &["userId"]),
        oauth_client_id: text(&payload, &["oauthClientId"]),
        connection_id: text(&payload, &["connectionId", "brokerageAuthorizationId"]),
        account_id: text(&payload, &["accountId"]),
        webhook_id,
        event_type,
        timestamp,
        payload,
    })
}

/// Stores the event once; `false` when this `webhookId` was already received.
pub async fn record(pool: &PgPool, event: &WebhookEvent) -> anyhow::Result<bool> {
    let inserted = sqlx::query(
        "INSERT INTO snaptrade_webhook_events (webhook_id, event_type, snaptrade_user_id, oauth_client_id,
            snaptrade_connection_id, snaptrade_account_id, event_timestamp, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (webhook_id) DO NOTHING",
    )
    .bind(&event.webhook_id)
    .bind(&event.event_type)
    .bind(&event.snaptrade_user_id)
    .bind(&event.oauth_client_id)
    .bind(&event.connection_id)
    .bind(&event.account_id)
    .bind(event.timestamp)
    .bind(&event.payload)
    .execute(pool)
    .await?
    .rows_affected();
    Ok(inserted == 1)
}

/// Drops events past any retry or replay window. They name SnapTrade users and
/// connections, so they should not outlive a deleted account for long.
pub async fn delete_old_events(pool: &PgPool) -> anyhow::Result<u64> {
    Ok(sqlx::query(
        "DELETE FROM snaptrade_webhook_events WHERE received_at < now() - interval '7 days'",
    )
    .execute(pool)
    .await?
    .rows_affected())
}

#[derive(sqlx::FromRow)]
struct StoredEvent {
    webhook_id: String,
    event_type: String,
    snaptrade_user_id: Option<String>,
    oauth_client_id: Option<String>,
    snaptrade_connection_id: Option<String>,
    snaptrade_account_id: Option<String>,
    attempts: i32,
}

impl Brokerage {
    /// Processes one stored event if it is due and no one else holds it.
    pub async fn process_webhook(&self, webhook_id: &str) -> anyhow::Result<()> {
        let leased = sqlx::query_as::<_, StoredEvent>(
            "UPDATE snaptrade_webhook_events
             SET next_attempt_at = now() + interval '5 minutes', attempts = attempts + 1
             WHERE webhook_id = $1 AND processed_at IS NULL AND next_attempt_at <= now()
             RETURNING webhook_id, event_type, snaptrade_user_id, oauth_client_id,
                snaptrade_connection_id, snaptrade_account_id, attempts",
        )
        .bind(webhook_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(event) = leased else { return Ok(()) };

        match self.handle_webhook(&event).await {
            Ok(outcome) => {
                sqlx::query(
                    "UPDATE snaptrade_webhook_events SET processed_at = now(), outcome = $2, last_error = NULL
                     WHERE webhook_id = $1",
                )
                .bind(&event.webhook_id)
                .bind(outcome)
                .execute(&self.pool)
                .await?;
                info!(webhook_id = %event.webhook_id, event_type = %event.event_type, outcome, "processed a SnapTrade webhook");
            }
            Err(error) => {
                let give_up = event.attempts >= MAX_ATTEMPTS;
                let backoff_minutes = 2_i64.pow(event.attempts.clamp(0, 6) as u32);
                sqlx::query(
                    "UPDATE snaptrade_webhook_events SET last_error = $2,
                        next_attempt_at = now() + make_interval(mins => $3),
                        processed_at = CASE WHEN $4 THEN now() ELSE NULL END,
                        outcome = CASE WHEN $4 THEN 'failed' ELSE NULL END
                     WHERE webhook_id = $1",
                )
                .bind(&event.webhook_id)
                .bind(format!("{error:#}"))
                .bind(backoff_minutes as i32)
                .bind(give_up)
                .execute(&self.pool)
                .await?;
                warn!(webhook_id = %event.webhook_id, error = %error, give_up, "SnapTrade webhook processing failed");
            }
        }
        Ok(())
    }

    /// Re-processes due events that a crash or failure left unprocessed.
    pub async fn process_pending_webhooks(&self) -> anyhow::Result<usize> {
        let due: Vec<String> = sqlx::query_scalar(
            "SELECT webhook_id FROM snaptrade_webhook_events
             WHERE processed_at IS NULL AND next_attempt_at <= now() ORDER BY received_at LIMIT 50",
        )
        .fetch_all(&self.pool)
        .await?;
        for webhook_id in &due {
            self.process_webhook(webhook_id).await?;
        }
        Ok(due.len())
    }

    /// The Tradstry user an event is about, or `None` when it is not for anyone
    /// Tradstry knows (another app, a removed registration, a revoked grant).
    async fn event_user(&self, event: &StoredEvent) -> anyhow::Result<Option<Uuid>> {
        let Some(snaptrade_user) = event.snaptrade_user_id.as_deref() else {
            return Ok(None);
        };
        match event.oauth_client_id.as_deref() {
            Some(client) => {
                if self.oauth_client_id.as_deref() != Some(client) {
                    return Ok(None);
                }
                Ok(
                    store::active_grant_by_identity(&self.pool, client, snaptrade_user)
                        .await?
                        .map(|grant| grant.user_id),
                )
            }
            None => Ok(
                store::registration_by_snaptrade_id(&self.pool, snaptrade_user)
                    .await?
                    .map(|registration| registration.user_id),
            ),
        }
    }

    async fn event_connection(
        &self,
        user_id: Uuid,
        event: &StoredEvent,
    ) -> anyhow::Result<Option<store::Connection>> {
        let Some(id) = event.snaptrade_connection_id.as_deref() else {
            return Ok(None);
        };
        Ok(store::connections_by_snaptrade_id(&self.pool, id)
            .await?
            .into_iter()
            .find(|connection| connection.user_id == user_id))
    }

    async fn handle_webhook(&self, event: &StoredEvent) -> anyhow::Result<&'static str> {
        let Some(user_id) = self.event_user(event).await? else {
            return Ok("ignored_unknown_user");
        };
        let connection = self.event_connection(user_id, event).await?;
        let linked = connection.as_ref().filter(|c| c.unlinked_at.is_none());
        let account = match event.snaptrade_account_id.as_deref() {
            Some(id) => store::account_by_snaptrade_id(&self.pool, user_id, id).await?,
            None => None,
        };
        let outcome = match event.event_type.as_str() {
            "CONNECTION_BROKEN" | "CONNECTION_FIXED" => {
                let Some(connection) = linked else {
                    return Ok("ignored_unlinked");
                };
                let disabled = event.event_type == "CONNECTION_BROKEN";
                store::set_connection_health(
                    &self.pool,
                    connection.id,
                    disabled,
                    disabled.then(Utc::now),
                    None,
                )
                .await?;
                if disabled {
                    "connection_disabled"
                } else {
                    "connection_enabled"
                }
            }
            "CONNECTION_ADDED" | "CONNECTION_UPDATED" => {
                let Some(connection) = linked else {
                    return Ok("ignored_unlinked");
                };
                self.refresh_connection_health(connection).await;
                "connection_refreshed"
            }
            "CONNECTION_DELETED" => {
                let Some(connection) = linked else {
                    return Ok("ignored_unlinked");
                };
                store::unlink_connection(&self.pool, connection.id).await?;
                "connection_unlinked"
            }
            "NEW_ACCOUNT_AVAILABLE" => {
                let Some(connection) = linked else {
                    return Ok("ignored_unlinked");
                };
                if account.as_ref().is_some_and(|a| a.unlinked_at.is_none()) {
                    return Ok("ignored_already_imported");
                }
                store::set_new_accounts_available(&self.pool, connection.id, true).await?;
                "new_accounts_flagged"
            }
            "ACCOUNT_REMOVED" => {
                let Some(account) = account.filter(|a| a.unlinked_at.is_none()) else {
                    return Ok("ignored_unknown_account");
                };
                store::unlink_account(&self.pool, account.id).await?;
                "account_unlinked"
            }
            "USER_DELETED" if event.oauth_client_id.is_none() => {
                self.forget_registration(user_id).await?;
                "registration_removed"
            }
            "ACCOUNT_TRANSACTIONS_INITIAL_UPDATE"
            | "ACCOUNT_TRANSACTIONS_UPDATED"
            | "ACCOUNT_HOLDINGS_UPDATED" => {
                let Some(account) = account.filter(|a| a.unlinked_at.is_none()) else {
                    return Ok("ignored_unknown_account");
                };
                let kind = match (
                    event.event_type.as_str(),
                    account.initial_import_completed_at,
                ) {
                    ("ACCOUNT_HOLDINGS_UPDATED", _) => JobKind::Holdings,
                    (_, None) => JobKind::Initial,
                    _ => JobKind::Transactions,
                };
                self.enqueue(account.id, kind, Utc::now()).await?;
                "sync_queued"
            }
            _ => "ignored",
        };
        Ok(outcome)
    }

    /// SnapTrade deleted the Commercial user, and its connections with it.
    async fn forget_registration(&self, user_id: Uuid) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        let ids: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM brokerage_connections WHERE user_id = $1 AND auth_mode = 'commercial' AND unlinked_at IS NULL",
        )
        .bind(user_id)
        .fetch_all(&mut *tx)
        .await?;
        for id in ids {
            store::unlink_connection(&mut *tx, id).await?;
        }
        sqlx::query("DELETE FROM snaptrade_registrations WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sign(body: &[u8], key: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
        mac.update(body);
        STANDARD.encode(mac.finalize().into_bytes())
    }

    fn payload(timestamp: &str) -> Value {
        json!({
            "schemaVersion": "oauth_v1", "webhookId": "hook-1", "oauthClientId": "app",
            "eventTimestamp": timestamp, "userId": "personal-1", "eventType": "connection_broken",
            "connectionId": "conn-1", "details": {"name": "Café"},
        })
    }

    #[test]
    fn verifies_raw_and_canonical_signatures_and_reads_both_schemas() {
        let now = Utc::now();
        let value = payload(&now.to_rfc3339());
        let pretty = serde_json::to_vec_pretty(&value).unwrap();
        for signed in [
            pretty.clone(),
            canonical_json(&value, false).into_bytes(),
            canonical_json(&value, true).into_bytes(),
        ] {
            let event = verify(&pretty, &sign(&signed, "key"), "key", now).unwrap();
            assert_eq!(event.event_type, "CONNECTION_BROKEN");
            assert_eq!(event.connection_id.as_deref(), Some("conn-1"));
            assert_eq!(event.oauth_client_id.as_deref(), Some("app"));
        }

        let commercial = json!({
            "webhookId": "hook-2", "clientId": "c", "eventTimestamp": now.to_rfc3339(), "userId": "u",
            "eventType": "CONNECTION_FIXED", "brokerageAuthorizationId": "conn-2",
        });
        let body = canonical_json(&commercial, false);
        let event = verify(body.as_bytes(), &sign(body.as_bytes(), "key"), "key", now).unwrap();
        assert_eq!(
            (event.connection_id.as_deref(), event.oauth_client_id),
            (Some("conn-2"), None)
        );

        let mut legacy = commercial.clone();
        legacy["webhookSecret"] = json!("whsec-legacy");
        let body = canonical_json(&legacy, false);
        let event = verify(body.as_bytes(), &sign(body.as_bytes(), "key"), "key", now).unwrap();
        assert_eq!(event.payload, commercial);
    }

    #[test]
    fn rejects_bad_signatures_and_out_of_window_timestamps() {
        let now = Utc::now();
        let body = canonical_json(&payload(&now.to_rfc3339()), false);
        assert_eq!(
            verify(body.as_bytes(), &sign(body.as_bytes(), "other"), "key", now),
            Err(WebhookError::Signature)
        );
        assert_eq!(
            verify(body.as_bytes(), "not base64!", "key", now),
            Err(WebhookError::Signature)
        );

        for timestamp in [now + Duration::minutes(5), now - Duration::hours(25)] {
            let body = canonical_json(&payload(&timestamp.to_rfc3339()), false);
            assert_eq!(
                verify(body.as_bytes(), &sign(body.as_bytes(), "key"), "key", now),
                Err(WebhookError::Stale)
            );
        }
        let retried = canonical_json(&payload(&(now - Duration::hours(4)).to_rfc3339()), false);
        assert!(
            verify(
                retried.as_bytes(),
                &sign(retried.as_bytes(), "key"),
                "key",
                now
            )
            .is_ok(),
            "SnapTrade retries are accepted"
        );
    }
}
