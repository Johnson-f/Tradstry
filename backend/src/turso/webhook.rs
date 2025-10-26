use anyhow::{Context, Result};
use actix_web::{
    http::{header::HeaderMap, StatusCode},
    web::Json,
};
use base64::prelude::*;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use std::sync::Arc;
use log::{info, error, warn};

use super::{
    config::{ClerkWebhookEvent, TursoConfig},
    client::TursoClient,
};
use crate::ApiResponse;

type HmacSha256 = Hmac<Sha256>;

/// Clerk webhook handler
pub struct ClerkWebhookHandler {
    turso_client: Arc<TursoClient>,
    config: Arc<TursoConfig>,
}

impl ClerkWebhookHandler {
    pub fn new(turso_client: Arc<TursoClient>, config: Arc<TursoConfig>) -> Self {
        Self {
            turso_client,
            config,
        }
    }

    /// Handle incoming Clerk webhook
    pub async fn handle_webhook(
        &self,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<Json<ApiResponse<Value>>, StatusCode> {
        // Verify the webhook signature
        if let Err(e) = self.verify_webhook_signature(headers, body) {
            error!("Webhook signature verification failed: {}", e);
            return Err(StatusCode::UNAUTHORIZED);
        }

        // Parse the webhook event
        let event: ClerkWebhookEvent = serde_json::from_slice(body)
            .map_err(|e| {
                error!("Failed to parse webhook event: {}", e);
                StatusCode::BAD_REQUEST
            })?;

        info!("Received Clerk webhook event: {}", event.r#type);

        let user_id = event.data.id.clone();
        
        // Handle the event based on type
        match event.r#type.as_str() {
            "user.created" => {
                if let Err(e) = self.handle_user_created(event).await {
                    error!("Failed to handle user.created event: {}", e);
                    return Err(StatusCode::INTERNAL_SERVER_ERROR);
                }
                Ok(Json(ApiResponse::success(serde_json::json!({
                    "message": "User created successfully",
                    "user_id": user_id
                }))))
            }
            "user.updated" => {
                info!("User updated: {}", event.data.id);
                // Handle user updates if needed
                Ok(Json(ApiResponse::success(serde_json::json!({
                    "message": "User updated event received",
                    "user_id": event.data.id
                }))))
            }
            "user.deleted" => {
                info!("User deleted: {}", event.data.id);
                // Handle user deletion if needed
                Ok(Json(ApiResponse::success(serde_json::json!({
                    "message": "User deleted event received",
                    "user_id": event.data.id
                }))))
            }
            _ => {
                warn!("Unhandled webhook event type: {}", event.r#type);
                Ok(Json(ApiResponse::success(serde_json::json!({
                    "message": "Event received but not handled",
                    "event_type": event.r#type
                }))))
            }
        }
    }

    /// Verify Clerk webhook signature
    fn verify_webhook_signature(&self, headers: &HeaderMap, body: &[u8]) -> Result<()> {
        let signature_header = headers
            .get("svix-signature")
            .or_else(|| headers.get("clerk-signature"))
            .context("Missing webhook signature header")?
            .to_str()
            .context("Invalid signature header format")?;

        // Parse the signature header (format: "v1,signature1 v1,signature2")
        let signatures: Vec<&str> = signature_header
            .split_whitespace()
            .filter(|s| s.starts_with("v1,"))
            .collect();

        if signatures.is_empty() {
            anyhow::bail!("No valid v1 signatures found");
        }

        // Get timestamp from header
        let timestamp = headers
            .get("svix-timestamp")
            .context("Missing timestamp header")?
            .to_str()
            .context("Invalid timestamp header")?;

        // Create signed payload: timestamp.body
        let signed_payload = format!("{}.{}", timestamp, std::str::from_utf8(body)?);

        // Verify at least one signature matches
        for signature in signatures {
            let signature_bytes = signature.strip_prefix("v1,").unwrap();
            
            if let Ok(expected_signature) = base64::prelude::BASE64_STANDARD.decode(signature_bytes)
                && self.verify_signature(&signed_payload, &expected_signature).is_ok()
            {
                return Ok(());
            }
        }

        anyhow::bail!("Signature verification failed")
    }

    /// Verify HMAC signature
    fn verify_signature(&self, payload: &str, expected_signature: &[u8]) -> Result<()> {
        let webhook_secret = self.config.clerk_webhook_secret
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Clerk webhook secret not configured"))?;
        
        let mut mac = HmacSha256::new_from_slice(webhook_secret.as_bytes())
            .context("Invalid webhook secret")?;
        
        mac.update(payload.as_bytes());
        
        mac.verify_slice(expected_signature)
            .map_err(|_| anyhow::anyhow!("HMAC verification failed"))
    }

    /// Handle user.created webhook event
    async fn handle_user_created(&self, event: ClerkWebhookEvent) -> Result<()> {
        let user_id = &event.data.id;
        
        // Get primary email from the user data
        let email = event.data.email_addresses
            .iter()
            .find(|email| email.verification.status == "verified")
            .or_else(|| event.data.email_addresses.first())
            .map(|email| email.email_address.clone())
            .context("User has no email addresses")?;

        info!("Creating database for new user: {} ({})", user_id, email);

        // Check if user database already exists
        if let Some(_existing) = self.turso_client.get_user_database(user_id).await? {
            warn!("Database already exists for user: {}", user_id);
            return Ok(());
        }

        // Create new user database
        let user_db_entry = self.turso_client
            .create_user_database(user_id, &email)
            .await
            .context("Failed to create user database")?;

        info!(
            "Successfully created database for user {}: {} ({})",
            user_id, user_db_entry.db_name, user_db_entry.db_url
        );

        Ok(())
    }
}

