use axum::extract::Extension;
use crate::auth::Claims;

// Handler for the protected route
pub async fn protected_handler(Extension(claims): Extension<Claims>) -> String {
    format!("Welcome, user_id: {}", claims.sub)
}