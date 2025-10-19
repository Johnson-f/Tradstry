use anyhow::Result;
use libsql::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookTag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTagRequest {
    pub name: Option<String>,
    pub color: Option<String>,
}

impl NotebookTag {
    pub async fn create(conn: &Connection, req: CreateTagRequest) -> Result<Self> {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO notebook_tags (id, name, color) VALUES (?, ?, coalesce(?, '#gray'))",
            params![id.clone(), req.name, req.color],
        ).await?;
        Self::find_by_id(conn, &id).await
    }

    pub async fn find_by_id(conn: &Connection, id: &str) -> Result<Self> {
        let stmt = conn.prepare(
            "SELECT id, name, color, created_at, updated_at FROM notebook_tags WHERE id = ?",
        ).await?;
        let mut rows = stmt.query(params![id]).await?;
        if let Some(row) = rows.next().await? { Ok(Self::from_row(row)?) } else { anyhow::bail!("Tag not found") }
    }

    pub async fn find_all(conn: &Connection) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            "SELECT id, name, color, created_at, updated_at FROM notebook_tags ORDER BY name ASC",
        ).await?;
        let mut rows = stmt.query(params![]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
        Ok(out)
    }

    pub async fn update(conn: &Connection, id: &str, updates: UpdateTagRequest) -> Result<Self> {
        let mut sets = Vec::new();
        let mut params_dyn: Vec<String> = Vec::new();
        if let Some(name) = updates.name { sets.push("name = ?".to_string()); params_dyn.push(name); }
        if let Some(color) = updates.color { sets.push("color = ?".to_string()); params_dyn.push(color); }
        if sets.is_empty() { return Self::find_by_id(conn, id).await; }
        sets.push("updated_at = ?".to_string()); params_dyn.push(chrono::Utc::now().to_rfc3339());
        params_dyn.push(id.to_string());
        let sql = format!("UPDATE notebook_tags SET {} WHERE id = ?", sets.join(", "));
        // Expand to a Params tuple by matching lengths
        match params_dyn.len() {
            1 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), id]).await?; }
            2 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), params_dyn[1].as_str(), id]).await?; }
            _ => { conn.execute(sql.as_str(), params![id]).await?; }
        }
        Self::find_by_id(conn, id).await
    }

    pub async fn delete(conn: &Connection, id: &str) -> Result<bool> {
        let affected = conn.execute("DELETE FROM notebook_tags WHERE id = ?", params![id]).await?;
        Ok(affected > 0)
    }

    pub async fn tag_note(conn: &Connection, note_id: &str, tag_id: &str) -> Result<()> {
        conn.execute(
            "INSERT OR IGNORE INTO notebook_note_tags (note_id, tag_id) VALUES (?, ?)",
            params![note_id, tag_id],
        ).await?;
        Ok(())
    }

    pub async fn untag_note(conn: &Connection, note_id: &str, tag_id: &str) -> Result<bool> {
        let affected = conn.execute(
            "DELETE FROM notebook_note_tags WHERE note_id = ? AND tag_id = ?",
            params![note_id, tag_id],
        ).await?;
        Ok(affected > 0)
    }

    #[allow(dead_code)]
    pub async fn get_note_tags(conn: &Connection, note_id: &str) -> Result<Vec<NotebookTag>> {
        let stmt = conn.prepare(
            r#"SELECT t.id, t.name, t.color, t.created_at, t.updated_at
                FROM notebook_tags t
                JOIN notebook_note_tags nt ON t.id = nt.tag_id
               WHERE nt.note_id = ?
               ORDER BY t.name ASC"#,
        ).await?;
        let mut rows = stmt.query(params![note_id]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
        Ok(out)
    }

    #[allow(dead_code)]
    pub async fn get_notes_by_tag(conn: &Connection, tag_id: &str) -> Result<Vec<String>> {
        let stmt = conn.prepare(
            "SELECT note_id FROM notebook_note_tags WHERE tag_id = ?",
        ).await?;
        let mut rows = stmt.query(params![tag_id]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? { out.push(row.get(0)?); }
        Ok(out)
    }

    fn from_row(row: libsql::Row) -> Result<Self> {
        Ok(Self { id: row.get(0)?, name: row.get(1)?, color: row.get(2)?, created_at: row.get(3)?, updated_at: row.get(4)? })
    }
}


