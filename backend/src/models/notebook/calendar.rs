use anyhow::Result;
use libsql::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub reminder_id: String,
    pub event_title: String,
    pub event_description: Option<String>,
    pub event_time: String,
    pub is_synced: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalCalendarConnection {
    pub id: String,
    pub provider: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expiry: String,
    pub calendar_id: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalCalendarEvent {
    pub id: String,
    pub connection_id: String,
    pub external_event_id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: String,
    pub location: Option<String>,
    pub last_synced_at: String,
}

impl CalendarEvent {
    pub async fn find_all(conn: &Connection) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            r#"SELECT id, reminder_id, event_title, event_description, event_time, is_synced, created_at, updated_at
                 FROM calendar_events ORDER BY event_time ASC"#,
        ).await?;
        let mut rows = stmt.query(params![]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? {
            out.push(Self {
                id: row.get(0)?,
                reminder_id: row.get(1)?,
                event_title: row.get(2)?,
                event_description: row.get(3)?,
                event_time: row.get(4)?,
                is_synced: match row.get::<i64>(5)? { 0 => false, _ => true },
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            });
        }
        Ok(out)
    }
}


