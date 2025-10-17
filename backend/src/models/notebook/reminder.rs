use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookReminder {
    pub id: String,
    pub note_id: String,
    pub title: String,
    pub description: Option<String>,
    pub reminder_time: String,
    pub is_completed: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReminderRequest {
    pub note_id: String,
    pub title: String,
    pub description: Option<String>,
    pub reminder_time: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReminderRequest {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub reminder_time: Option<String>,
    pub is_completed: Option<bool>,
}

impl NotebookReminder {
    pub async fn create(conn: &Connection, req: CreateReminderRequest) -> Result<Self> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            r#"INSERT INTO notebook_reminders (id, note_id, title, description, reminder_time, is_completed, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 0, ?, ?)"#,
            params![id.clone(), req.note_id, req.title.clone(), req.description.clone(), req.reminder_time.clone(), now.clone(), now.clone()],
        ).await?;

        // Create calendar event automatically
        conn.execute(
            r#"INSERT INTO calendar_events (id, reminder_id, event_title, event_description, event_time, is_synced, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 0, ?, ?)"#,
            params![uuid::Uuid::new_v4().to_string(), id.clone(), req.title, req.description, req.reminder_time, now.clone(), now.clone()],
        ).await?;

        Self::find_by_id(conn, &id).await
    }

    pub async fn find_by_id(conn: &Connection, id: &str) -> Result<Self> {
        let stmt = conn.prepare(
            r#"SELECT id, note_id, title, description, reminder_time, is_completed, created_at, updated_at
                FROM notebook_reminders WHERE id = ?"#,
        ).await?;
        let mut rows = stmt.query(params![id]).await?;
        if let Some(row) = rows.next().await? { Ok(Self::from_row(row)?) } else { anyhow::bail!("Reminder not found") }
    }

    #[allow(dead_code)]
    pub async fn find_by_note_id(conn: &Connection, note_id: &str) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            r#"SELECT id, note_id, title, description, reminder_time, is_completed, created_at, updated_at
                FROM notebook_reminders WHERE note_id = ? ORDER BY reminder_time ASC"#,
        ).await?;
        let mut rows = stmt.query(params![note_id]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
        Ok(out)
    }

    pub async fn update(conn: &Connection, id: &str, updates: UpdateReminderRequest) -> Result<Self> {
        let mut sets = Vec::new();
        let mut params_dyn: Vec<String> = Vec::new();
        if let Some(title) = updates.title { sets.push("title = ?".to_string()); params_dyn.push(title); }
        if let Some(desc_opt) = updates.description { match desc_opt { Some(desc) => { sets.push("description = ?".to_string()); params_dyn.push(desc); }, None => sets.push("description = NULL".to_string()) } }
        if let Some(rt) = updates.reminder_time { sets.push("reminder_time = ?".to_string()); params_dyn.push(rt); }
        if let Some(done) = updates.is_completed { sets.push("is_completed = ?".to_string()); params_dyn.push((if done {1}else{0}).to_string()); }
        if sets.is_empty() { return Self::find_by_id(conn, id).await; }
        sets.push("updated_at = ?".to_string()); params_dyn.push(Utc::now().to_rfc3339());
        params_dyn.push(id.to_string());
        let sql = format!("UPDATE notebook_reminders SET {} WHERE id = ?", sets.join(", "));
        match params_dyn.len() {
            1 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), id]).await?; }
            2 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), params_dyn[1].as_str(), id]).await?; }
            3 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), params_dyn[1].as_str(), params_dyn[2].as_str(), id]).await?; }
            4 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), params_dyn[1].as_str(), params_dyn[2].as_str(), params_dyn[3].as_str(), id]).await?; }
            _ => { conn.execute(sql.as_str(), params![id]).await?; }
        }
        Self::find_by_id(conn, id).await
    }

    pub async fn delete(conn: &Connection, id: &str) -> Result<bool> {
        // calendar_events has FK ON DELETE CASCADE
        let affected = conn.execute("DELETE FROM notebook_reminders WHERE id = ?", params![id]).await?;
        Ok(affected > 0)
    }

    pub async fn mark_completed(conn: &Connection, id: &str) -> Result<Self> {
        conn.execute(
            "UPDATE notebook_reminders SET is_completed = 1, updated_at = ? WHERE id = ?",
            params![Utc::now().to_rfc3339(), id],
        ).await?;
        Self::find_by_id(conn, id).await
    }

    fn from_row(row: libsql::Row) -> Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            note_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            reminder_time: row.get(4)?,
            is_completed: match row.get::<i64>(5)? { 0 => false, _ => true },
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }
}


