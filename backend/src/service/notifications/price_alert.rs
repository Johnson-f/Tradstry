use anyhow::{Context, Result};
use libsql::{params, Connection};
use log::{error, info};

use super::push::{PushPayload, PushService};
use crate::service::market_engine::watchlist_price::AlertTrigger;
use crate::turso::config::WebPushConfig;

/// Check if a notification was already sent for this alert
pub async fn was_alert_notification_sent(conn: &Connection, alert_id: &str) -> Result<bool> {
    let mut stmt = conn
        .prepare("SELECT 1 FROM alert_notifications_sent WHERE alert_id = ?")
        .await
        .context("Failed to prepare alert notification check query")?;
    
    let mut rows = stmt.query(params![alert_id]).await
        .context("Failed to execute alert notification check query")?;
    
    Ok(rows.next().await?.is_some())
}

/// Mark an alert notification as sent
pub async fn mark_alert_notification_sent(conn: &Connection, alert_id: &str, user_id: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO alert_notifications_sent (alert_id, user_id, sent_at) VALUES (?, ?, datetime('now'))",
        params![alert_id, user_id],
    )
    .await
    .context("Failed to mark alert notification as sent")?;
    
    Ok(())
}

/// Reset notification sent status for an alert (used when alert price is updated)
pub async fn reset_alert_notification_status(conn: &Connection, alert_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM alert_notifications_sent WHERE alert_id = ?",
        params![alert_id],
    )
    .await
    .context("Failed to reset alert notification status")?;
    
    Ok(())
}

/// Send push notifications for triggered price alerts
/// This function checks if notifications were already sent and only sends new ones
pub async fn send_price_alert_notifications(
    conn: &Connection,
    triggered_alerts: &[AlertTrigger],
    user_id: &str,
    web_push_config: &WebPushConfig,
) -> Result<usize> {
    if triggered_alerts.is_empty() {
        return Ok(0);
    }

    let push_service = PushService::new(conn, web_push_config);
    let mut sent_count = 0;

    for alert in triggered_alerts {
        // Check if notification was already sent
        let already_sent = was_alert_notification_sent(conn, &alert.alert_id).await
            .unwrap_or(false);

        if already_sent {
            info!("Alert {} already sent notification, skipping", alert.alert_id);
            continue;
        }

        // Format the notification message
        let direction = if alert.alert_type == "above" { "above" } else { "below" };
        
        // Calculate percentage change if available
        let change_pct = alert.price_change
            .and_then(|change| {
                if alert.current_price != 0.0 {
                    Some((change / alert.current_price) * 100.0)
                } else {
                    None
                }
            })
            .map(|pct| format!(" ({:.2}%)", pct))
            .unwrap_or_default();

        let title = format!("Price Alert: {}", alert.symbol);
        let body = format!(
            "{} is now ${:.2} ({} ${:.2}){}",
            alert.stock_name,
            alert.current_price,
            direction,
            alert.alert_price,
            change_pct
        );

        // Add note if available
        let full_body = if let Some(ref note) = alert.note {
            format!("{}\nNote: {}", body, note)
        } else {
            body
        };

        let payload = PushPayload {
            title,
            body: Some(full_body),
            icon: Some("/icons/icon-192.png".to_string()),
            url: Some(format!("/app/markets?symbol={}", alert.symbol)),
            tag: Some(format!("price-alert-{}", alert.alert_id)), // Use tag to group/update notifications
            data: Some(serde_json::json!({
                "type": "price_alert",
                "alert_id": alert.alert_id,
                "symbol": alert.symbol,
                "current_price": alert.current_price,
                "alert_price": alert.alert_price,
                "alert_type": alert.alert_type,
            })),
        };

        // Send notification
        match push_service.send_to_user(user_id, &payload).await {
            Ok(_) => {
                // Mark as sent after successful notification
                if let Err(e) = mark_alert_notification_sent(conn, &alert.alert_id, user_id).await {
                    error!("Failed to mark alert {} as sent: {}", alert.alert_id, e);
                } else {
                    info!("Successfully sent price alert notification for {} ({})", alert.symbol, alert.alert_id);
                    sent_count += 1;
                }
            }
            Err(e) => {
                error!("Failed to send push notification for alert {}: {}", alert.alert_id, e);
                // Don't mark as sent if notification failed
            }
        }
    }

    Ok(sent_count)
}

