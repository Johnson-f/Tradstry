use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
// use serde::Deserialize;
use reqwest::Client;

#[derive(Debug, Clone)]
pub struct CalendarService;

impl CalendarService {
    #[allow(dead_code)]
    pub fn new() -> Self { Self }

    // Token refresh methods
    pub async fn refresh_google_token(refresh_token: &str, client_id: &str, client_secret: &str) -> Result<(String, String, String)> {
        let client = Client::new();
        let resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("refresh_token", refresh_token),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await?;
        let json: serde_json::Value = resp.json().await?;
        let access = json.get("access_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let expires_in = json.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
        let expiry = (Utc::now() + chrono::Duration::seconds(expires_in)).to_rfc3339();
        Ok((access, refresh_token.to_string(), expiry))
    }

    pub async fn ensure_valid_token(conn: &Connection, connection_id: &str, client_id: &str, client_secret: &str) -> Result<String> {
        // Get current token info
        let stmt = conn.prepare("SELECT access_token, refresh_token, token_expiry FROM external_calendar_connections WHERE id = ?").await?;
        let mut rows = stmt.query(params![connection_id]).await?;
        
        if let Some(row) = rows.next().await? {
            let access_token: String = row.get(0)?;
            let refresh_token: String = row.get(1)?;
            let token_expiry: String = row.get(2)?;
            
            // Check if token is expired
            let expiry_time = chrono::DateTime::parse_from_rfc3339(&token_expiry)
                .map_err(|_| anyhow::anyhow!("Invalid expiry format"))?;
            
            if Utc::now() < expiry_time {
                return Ok(access_token);
            }
            
            // Token is expired, refresh it
            let (new_access, new_refresh, new_expiry) = Self::refresh_google_token(&refresh_token, client_id, client_secret).await?;
            
            // Update the database with new tokens
            conn.execute(
                "UPDATE external_calendar_connections SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = datetime('now') WHERE id = ?",
                params![new_access.clone(), new_refresh, new_expiry, connection_id],
            ).await?;
            
            Ok(new_access)
        } else {
            Err(anyhow::anyhow!("Connection not found"))
        }
    }

    // Connection management
    pub async fn connect_provider(
        conn: &Connection,
        provider: &str,
        access_token: &str,
        refresh_token: &str,
        token_expiry: &str,
        calendar_id: Option<&str>,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO external_calendar_connections (id, provider, access_token, refresh_token, token_expiry, calendar_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
            params![id.clone(), provider, access_token, refresh_token, token_expiry, calendar_id],
        ).await?;
        Ok(id)
    }

    pub async fn disconnect_provider(conn: &Connection, connection_id: &str) -> Result<bool> {
        let affected = conn.execute(
            "DELETE FROM external_calendar_connections WHERE id = ?",
            params![connection_id],
        ).await?;
        Ok(affected > 0)
    }

    // Sync stub: fetch external events and cache them locally
    pub async fn sync_external_events(conn: &Connection, connection_id: &str, client_id: &str, client_secret: &str) -> Result<u64> {
        // Load connection
        let mut rows = conn
            .prepare("SELECT provider, access_token, calendar_id FROM external_calendar_connections WHERE id = ?")
            .await?
            .query(params![connection_id])
            .await?;

        if let Some(row) = rows.next().await? {
            let provider: String = row.get(0)?;
            let access_token: String = row.get(1)?;
            let calendar_id: Option<String> = row.get(2)?;

            match provider.as_str() {
                "google" => {
                    // Ensure token is valid before syncing
                    let valid_token = Self::ensure_valid_token(conn, connection_id, client_id, client_secret).await?;
                    Self::sync_google_events(conn, connection_id, &valid_token, calendar_id.as_deref()).await
                },
                "microsoft" => Self::sync_microsoft_events(conn, &access_token).await,
                _ => Ok(0),
            }
        } else {
            Ok(0)
        }
    }

    async fn sync_google_events(conn: &Connection, connection_id: &str, access_token: &str, calendar_id: Option<&str>) -> Result<u64> {
        let cal_id = calendar_id.unwrap_or("primary");
        let url = format!("https://www.googleapis.com/calendar/v3/calendars/{}/events?maxResults=50", cal_id);
        let client = Client::new();
        let resp = client
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await?;
        if !resp.status().is_success() { return Ok(0); }
        let body: serde_json::Value = resp.json().await?;
        let mut inserted = 0u64;
        if let Some(items) = body.get("items").and_then(|v| v.as_array()) {
            for item in items {
                let ext_id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                let title = item.get("summary").and_then(|v| v.as_str()).unwrap_or("(no title)");
                let description = item.get("description").and_then(|v| v.as_str());
                let start_time = item.get("start").and_then(|s| s.get("dateTime")).and_then(|v| v.as_str())
                    .or_else(|| item.get("start").and_then(|s| s.get("date")).and_then(|v| v.as_str()))
                    .unwrap_or(&Utc::now().to_rfc3339()).to_string();
                let end_time = item.get("end").and_then(|s| s.get("dateTime")).and_then(|v| v.as_str())
                    .or_else(|| item.get("end").and_then(|s| s.get("date")).and_then(|v| v.as_str()))
                    .unwrap_or(&Utc::now().to_rfc3339()).to_string();
                let location = item.get("location").and_then(|v| v.as_str());

                let id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT OR REPLACE INTO external_calendar_events (id, connection_id, external_event_id, title, description, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    params![id, connection_id, ext_id, title, description, start_time, end_time, location],
                ).await?;
                inserted += 1;
            }
        }
        Ok(inserted)
    }

    async fn sync_microsoft_events(conn: &Connection, access_token: &str) -> Result<u64> {
        let client = Client::new();
        let resp = client
            .get("https://graph.microsoft.com/v1.0/me/events?$top=50")
            .bearer_auth(access_token)
            .send()
            .await?;
        if !resp.status().is_success() { return Ok(0); }
        let body: serde_json::Value = resp.json().await?;
        let mut inserted = 0u64;
        if let Some(items) = body.get("value").and_then(|v| v.as_array()) {
            for item in items {
                let ext_id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                let title = item.get("subject").and_then(|v| v.as_str()).unwrap_or("(no title)");
                let description = item.get("bodyPreview").and_then(|v| v.as_str());
                let start_time = item.get("start").and_then(|s| s.get("dateTime")).and_then(|v| v.as_str()).unwrap_or(&Utc::now().to_rfc3339()).to_string();
                let end_time = item.get("end").and_then(|s| s.get("dateTime")).and_then(|v| v.as_str()).unwrap_or(&Utc::now().to_rfc3339()).to_string();
                let location = item.get("location").and_then(|s| s.get("displayName")).and_then(|v| v.as_str());

                let id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT OR REPLACE INTO external_calendar_events (id, connection_id, external_event_id, title, description, start_time, end_time, location) VALUES (?, (SELECT id FROM external_calendar_connections WHERE access_token = ? LIMIT 1), ?, ?, ?, ?, ?, ?)",
                    params![id, access_token, ext_id, title, description, start_time, end_time, location],
                ).await?;
                inserted += 1;
            }
        }
        Ok(inserted)
    }

    // OAuth code exchange (no extra crates, uses reqwest)
    // (kept for future typed parsing if needed)
    // #[derive(Deserialize)]
    // struct TokenResponse { access_token: String, refresh_token: Option<String>, expires_in: Option<i64> }

    pub async fn google_exchange_code(code: &str, client_id: &str, client_secret: &str, redirect_uri: &str) -> Result<(String, String, String)> {
        let client = Client::new();
        let resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("redirect_uri", redirect_uri),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await?;
        let json: serde_json::Value = resp.json().await?;
        let access = json.get("access_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let refresh = json.get("refresh_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let expires_in = json.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
        let expiry = (Utc::now() + chrono::Duration::seconds(expires_in)).to_rfc3339();
        Ok((access, refresh, expiry))
    }

    pub async fn microsoft_exchange_code(code: &str, client_id: &str, client_secret: &str, redirect_uri: &str, tenant: &str) -> Result<(String, String, String)> {
        let token_url = format!("https://login.microsoftonline.com/{}/oauth2/v2.0/token", tenant);
        let client = Client::new();
        let resp = client
            .post(token_url)
            .form(&[
                ("client_id", client_id),
                ("scope", "https://graph.microsoft.com/.default offline_access"),
                ("code", code),
                ("redirect_uri", redirect_uri),
                ("grant_type", "authorization_code"),
                ("client_secret", client_secret),
            ])
            .send()
            .await?;
        let json: serde_json::Value = resp.json().await?;
        let access = json.get("access_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let refresh = json.get("refresh_token").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let expiry = Utc::now().to_rfc3339();
        Ok((access, refresh, expiry))
    }
}


