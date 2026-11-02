use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde_json::Value;
use tracing::{error, warn};

use super::svix::verify_svix_signature;
use crate::{app::AppState, users, users::account};

/// Stytch names the event in the Svix envelope, not the body. The body of both
/// `direct.user.delete` and `dashboard.user.delete` is a user DELETE.
pub fn deleted_user_id(payload: &Value) -> Option<&str> {
    let text = |name: &str| payload.get(name).and_then(Value::as_str);
    if text("object_type")? != "user" || !text("action")?.eq_ignore_ascii_case("delete") {
        return None;
    }
    text("id")
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name)?.to_str().ok()
}

/// Purges the Tradstry account of a user deleted in Stytch. Failures answer 500
/// so Svix retries instead of leaving the account's data behind.
pub async fn stytch_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(secret) = state.stytch_webhook_secret.as_deref() else {
        error!("STYTCH_WEBHOOK_SECRET is not set; refusing the webhook");
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    let (Some(svix_id), Some(timestamp), Some(signature)) = (
        header(&headers, "svix-id"),
        header(&headers, "svix-timestamp"),
        header(&headers, "svix-signature"),
    ) else {
        return StatusCode::BAD_REQUEST;
    };
    let now = chrono::Utc::now().timestamp();
    if let Err(err) = verify_svix_signature(secret, svix_id, timestamp, signature, &body, now) {
        warn!(error = %err, "rejected a Stytch webhook");
        return StatusCode::UNAUTHORIZED;
    }
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return StatusCode::BAD_REQUEST;
    };
    let Some(stytch_user_id) = deleted_user_id(&payload) else {
        return StatusCode::OK;
    };
    let user = match users::find_by_stytch_id(&state.pool, stytch_user_id).await {
        Ok(Some(user)) => user,
        Ok(None) => return StatusCode::OK,
        Err(err) => {
            error!(error = %err, "failed to look up a deleted Stytch user");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };
    match account::purge(&state.pool, state.brokerage.as_deref(), &user).await {
        Ok(()) => StatusCode::OK,
        Err(err) => {
            error!(error = %err, user_id = %user.id, "failed to purge a deleted Stytch user");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_user_deletions_name_a_user() {
        assert_eq!(
            deleted_user_id(&json!({"object_type": "user", "action": "DELETE", "id": "user-1"})),
            Some("user-1")
        );
        assert_eq!(
            deleted_user_id(&json!({"object_type": "user", "action": "UPDATE", "id": "user-1"})),
            None
        );
        assert_eq!(
            deleted_user_id(&json!({"object_type": "session", "action": "DELETE", "id": "s"})),
            None
        );
        assert_eq!(deleted_user_id(&json!({})), None);
    }
}
