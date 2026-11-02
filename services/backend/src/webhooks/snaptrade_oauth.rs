use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
};
use serde::Deserialize;
use tracing::error;

use crate::app::AppState;

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

/// Where SnapTrade sends the browser after the user approves or denies
/// Tradstry. The browser is redirected on to the website with only the attempt
/// ID and status, never a code or token; the website then asks the backend,
/// as the signed-in user, what happened.
pub async fn snaptrade_oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Response {
    let Some(brokerage) = state.brokerage.as_deref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let outcome = brokerage
        .oauth_callback(
            query.state.as_deref().unwrap_or_default(),
            query.code.as_deref(),
            query.error.as_deref(),
        )
        .await;
    let mut target = brokerage.website_url.clone();
    target.set_path("/brokerage/oauth/callback");
    match outcome {
        Ok(outcome) => {
            let mut pairs = target.query_pairs_mut();
            if let Some(attempt_id) = outcome.attempt_id {
                pairs.append_pair("attempt", &attempt_id.to_string());
            }
            pairs.append_pair("status", &outcome.status);
        }
        Err(err) => {
            error!(error = %err, "SnapTrade OAuth callback failed");
            target.query_pairs_mut().append_pair("status", "error");
        }
    }
    Redirect::to(target.as_str()).into_response()
}
