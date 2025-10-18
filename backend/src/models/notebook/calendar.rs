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

impl ExternalCalendarConnection {
    pub async fn find_by_user(conn: &Connection) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            "SELECT * FROM external_calendar_connections WHERE provider = 'google' AND is_active = 1"
        ).await?;
        let mut rows = stmt.query(params![]).await?;
        let mut connections = Vec::new();
        while let Some(row) = rows.next().await? {
            connections.push(Self::from_row(row)?);
        }
        Ok(connections)
    }
    
    #[allow(dead_code)]
    pub async fn update_tokens(conn: &Connection, id: &str, access_token: &str, refresh_token: &str, expiry: &str) -> Result<()> {
        conn.execute(
            "UPDATE external_calendar_connections SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = datetime('now') WHERE id = ?",
            params![access_token, refresh_token, expiry, id],
        ).await?;
        Ok(())
    }
    
    fn from_row(row: libsql::Row) -> Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            provider: row.get(1)?,
            access_token: row.get(2)?,
            refresh_token: row.get(3)?,
            token_expiry: row.get(4)?,
            calendar_id: row.get(5)?,
            is_active: row.get::<i64>(6)? != 0,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }
}

impl ExternalCalendarEvent {
    #[allow(dead_code)]
    pub async fn find_by_connection(conn: &Connection, connection_id: &str) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            "SELECT * FROM external_calendar_events WHERE connection_id = ? ORDER BY start_time ASC"
        ).await?;
        let mut rows = stmt.query(params![connection_id]).await?;
        let mut events = Vec::new();
        while let Some(row) = rows.next().await? {
            events.push(Self::from_row(row)?);
        }
        Ok(events)
    }
    
    pub async fn find_by_date_range(conn: &Connection, start: &str, end: &str) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            "SELECT * FROM external_calendar_events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC"
        ).await?;
        let mut rows = stmt.query(params![start, end]).await?;
        let mut events = Vec::new();
        while let Some(row) = rows.next().await? {
            events.push(Self::from_row(row)?);
        }
        Ok(events)
    }
    
    fn from_row(row: libsql::Row) -> Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            connection_id: row.get(1)?,
            external_event_id: row.get(2)?,
            title: row.get(3)?,
            description: row.get(4)?,
            start_time: row.get(5)?,
            end_time: row.get(6)?,
            location: row.get(7)?,
            last_synced_at: row.get(8)?,
        })
    }
}


