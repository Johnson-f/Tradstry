use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use tracing::{error, warn};

use crate::app::AppState;
use crate::brokerage::webhooks::{self, WebhookError};

/// Verifies, records, and acknowledges a SnapTrade webhook, then processes it
/// in the background. A failure after recording is retried by the sweeper,
/// not by asking SnapTrade to resend.
pub async fn snaptrade_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(brokerage) = state.brokerage.clone() else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    let signature = headers
        .get("signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    let event = match webhooks::verify(
        &body,
        signature,
        &brokerage.consumer_key,
        chrono::Utc::now(),
    ) {
        Ok(event) => event,
        Err(WebhookError::Signature) => {
            warn!("rejected a SnapTrade webhook with a bad signature");
            return StatusCode::UNAUTHORIZED;
        }
        Err(other) => {
            warn!(error = %other, "rejected a SnapTrade webhook");
            return StatusCode::BAD_REQUEST;
        }
    };
    match webhooks::record(&brokerage.pool, &event).await {
        Ok(true) => {
            let webhook_id = event.webhook_id;
            tokio::spawn(async move {
                if let Err(err) = brokerage.process_webhook(&webhook_id).await {
                    error!(%webhook_id, error = %err, "could not process a SnapTrade webhook");
                }
            });
            StatusCode::OK
        }
        // Already received; SnapTrade retried or replayed it.
        Ok(false) => StatusCode::OK,
        Err(err) => {
            error!(error = %err, "could not record a SnapTrade webhook");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
