use serde::{Deserialize, Serialize};
use std::env;

/// Configuration for Turso database connections
#[derive(Debug, Clone)]
pub struct TursoConfig {
    /// Central registry database URL (main Turso database)
    pub registry_db_url: String,
    /// Central registry database auth token
    pub registry_db_token: String,
    /// Turso API token for creating new databases
    pub turso_api_token: String,
    /// Turso organization name
    pub turso_org: String,
    /// Supabase configuration
    pub supabase: SupabaseConfig,
    /// Legacy Clerk webhook secret (for migration period)
    pub clerk_webhook_secret: Option<String>,
}

/// Supabase authentication configuration
#[derive(Debug, Clone)]
pub struct SupabaseConfig {
    pub project_url: String,
    #[allow(dead_code)]
    pub anon_key: String,
    #[allow(dead_code)]
    pub service_role_key: String,
    #[allow(dead_code)]
    pub jwks_url: String,
}

impl TursoConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let supabase_config = SupabaseConfig::from_env()?;
        
        Ok(Self {
            registry_db_url: env::var("REGISTRY_DB_URL")
                .map_err(|_| "REGISTRY_DB_URL environment variable not set")?,
            registry_db_token: env::var("REGISTRY_DB_TOKEN")
                .map_err(|_| "REGISTRY_DB_TOKEN environment variable not set")?,
            turso_api_token: env::var("TURSO_API_TOKEN")
                .map_err(|_| "TURSO_API_TOKEN environment variable not set")?,
            turso_org: env::var("TURSO_ORG")
                .map_err(|_| "TURSO_ORG environment variable not set")?,
            supabase: supabase_config,
            clerk_webhook_secret: env::var("CLERK_WEBHOOK_SECRET").ok(),
        })
    }
}

impl SupabaseConfig {
    /// Load Supabase configuration from environment variables
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let project_url = env::var("SUPABASE_URL")
            .map_err(|_| "SUPABASE_URL environment variable not set")?;
        let anon_key = env::var("SUPABASE_ANON_KEY")
            .map_err(|_| "SUPABASE_ANON_KEY environment variable not set")?;
        let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
            .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY environment variable not set")?;
        
        // Supabase JWKS endpoint follows standard format
        // Should be: https://your-project.supabase.co/auth/v1/.well-known/jwks
        let jwks_url = format!("{}/auth/v1/.well-known/jwks", project_url);
        
        Ok(Self {
            project_url,
            anon_key,
            service_role_key,
            jwks_url,
        })
    }
}

/// JWT Claims structure from Supabase Auth
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseClaims {
    pub aud: String,           // "authenticated"
    pub exp: i64,              // Expiration timestamp
    pub iat: i64,              // Issued at timestamp
    pub iss: String,           // Issuer (Supabase URL)
    pub sub: String,           // User UUID
    pub email: Option<String>, // User email
    pub phone: Option<String>, // User phone
    pub role: String,          // "authenticated"
    pub aal: String,           // Authentication assurance level
    pub amr: Vec<AmrEntry>,    // Authentication method reference
    pub session_id: String,    // Session identifier
    pub is_anonymous: Option<bool>,
    
    // User metadata
    pub user_metadata: Option<serde_json::Value>,
    pub app_metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmrEntry {
    pub method: String,
    pub timestamp: i64,
}

/// Legacy JWT Claims structure from Clerk (kept for migration)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClerkClaims {
    pub aud: String,
    pub exp: usize,
    pub iat: usize,
    pub iss: String,
    pub sub: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub app_metadata: serde_json::Value,
    pub user_metadata: serde_json::Value,
    pub role: Option<String>,
}

/// Clerk webhook event structure
#[derive(Debug, Serialize, Deserialize)]
pub struct ClerkWebhookEvent {
    pub object: String,
    pub r#type: String,
    pub data: ClerkUserData,
}

/// Clerk user data from webhook
#[derive(Debug, Serialize, Deserialize)]
pub struct ClerkUserData {
    pub id: String,
    pub username: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email_addresses: Vec<ClerkEmailAddress>,
    pub image_url: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub public_metadata: serde_json::Value,
    pub private_metadata: serde_json::Value,
    pub unsafe_metadata: serde_json::Value,
}

/// Clerk email address structure
#[derive(Debug, Serialize, Deserialize)]
pub struct ClerkEmailAddress {
    pub id: String,
    pub email_address: String,
    pub verification: ClerkVerification,
}

/// Clerk verification status
#[derive(Debug, Serialize, Deserialize)]
pub struct ClerkVerification {
    pub status: String,
}
