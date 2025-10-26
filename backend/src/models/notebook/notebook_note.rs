use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookNote {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub content: Value,
    pub position: i64,
    pub is_deleted: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateNoteRequest {
    pub parent_id: Option<String>,
    pub title: String,
    pub content: Option<Value>,
    pub position: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateNoteRequest {
    pub title: Option<String>,
    pub content: Option<Value>,
    pub parent_id: Option<Option<String>>, // Some(None) means set to null
    pub position: Option<i64>,
    pub is_deleted: Option<bool>,
}

impl NotebookNote {
    pub async fn create(conn: &Connection, req: CreateNoteRequest) -> Result<Self> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let position = req.position.unwrap_or_default();
        let content = req.content.unwrap_or_else(|| Value::Array(vec![]));
        let content_str = serde_json::to_string(&content)?;

        conn.execute(
            r#"INSERT INTO notebook_notes (id, parent_id, title, content, position, is_deleted, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 0, ?, ?)"#,
            params![id.clone(), req.parent_id, req.title, content_str, position, now.clone(), now],
        ).await?;

        Self::find_by_id(conn, &id).await
    }

    pub async fn find_by_id(conn: &Connection, id: &str) -> Result<Self> {
        let stmt = conn.prepare(
            r#"SELECT id, parent_id, title, content, position, is_deleted, created_at, updated_at
                FROM notebook_notes WHERE id = ?"#,
        ).await?;
        let mut rows = stmt.query(params![id]).await?;
        if let Some(row) = rows.next().await? {
            Ok(Self::from_row(row)?)
        } else {
            anyhow::bail!(format!("Note not found: {}", id))
        }
    }

    pub async fn find_all(conn: &Connection, parent_id: Option<&str>) -> Result<Vec<Self>> {
        if let Some(pid) = parent_id {
            let stmt = conn.prepare(
                r#"SELECT id, parent_id, title, content, position, is_deleted, created_at, updated_at
                    FROM notebook_notes WHERE parent_id = ? AND is_deleted = 0 ORDER BY position ASC, created_at ASC"#,
            ).await?;
            let mut rows = stmt.query(params![pid]).await?;
            let mut out = Vec::new();
            while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
            Ok(out)
        } else {
            let stmt = conn.prepare(
                r#"SELECT id, parent_id, title, content, position, is_deleted, created_at, updated_at
                    FROM notebook_notes WHERE parent_id IS NULL AND is_deleted = 0 ORDER BY position ASC, created_at ASC"#,
            ).await?;
            let mut rows = stmt.query(params![]).await?;
            let mut out = Vec::new();
            while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
            Ok(out)
        }
    }

    pub async fn find_children(conn: &Connection, id: &str) -> Result<Vec<Self>> {
        Self::find_all(conn, Some(id)).await
    }

    pub async fn find_deleted(conn: &Connection) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            r#"SELECT id, parent_id, title, content, position, is_deleted, created_at, updated_at
                FROM notebook_notes WHERE is_deleted = 1 ORDER BY updated_at DESC"#,
        ).await?;
        let mut rows = stmt.query(params![]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
        Ok(out)
    }

    pub async fn find_tree(conn: &Connection, id: &str) -> Result<(Self, Vec<(NotebookNote, Vec<NotebookNote>)>)> {
        let root = Self::find_by_id(conn, id).await?;
        let children = Self::find_children(conn, id).await?;
        let mut tree: Vec<(NotebookNote, Vec<NotebookNote>)> = Vec::new();
        for child in children {
            let grand_children = Self::find_children(conn, &child.id).await?;
            tree.push((child, grand_children));
        }
        Ok((root, tree))
    }

    pub async fn update(conn: &Connection, id: &str, updates: UpdateNoteRequest) -> Result<Self> {
        if let Some(title) = updates.title { conn.execute("UPDATE notebook_notes SET title = ?, updated_at = ? WHERE id = ?", params![title, Utc::now().to_rfc3339(), id]).await?; }
        if let Some(content) = updates.content { 
            let content_str = serde_json::to_string(&content)?;
            conn.execute("UPDATE notebook_notes SET content = ?, updated_at = ? WHERE id = ?", params![content_str, Utc::now().to_rfc3339(), id]).await?; 
        }
        if let Some(pos) = updates.position { conn.execute("UPDATE notebook_notes SET position = ?, updated_at = ? WHERE id = ?", params![pos, Utc::now().to_rfc3339(), id]).await?; }
        if let Some(is_deleted) = updates.is_deleted { conn.execute("UPDATE notebook_notes SET is_deleted = ?, updated_at = ? WHERE id = ?", params![if is_deleted {1} else {0}, Utc::now().to_rfc3339(), id]).await?; }
        if let Some(parent_opt) = updates.parent_id {
            match parent_opt {
                Some(pid) => { conn.execute("UPDATE notebook_notes SET parent_id = ?, updated_at = ? WHERE id = ?", params![pid, Utc::now().to_rfc3339(), id]).await?; }
                None => { conn.execute("UPDATE notebook_notes SET parent_id = NULL, updated_at = ? WHERE id = ?", params![Utc::now().to_rfc3339(), id]).await?; }
            }
        }
        Self::find_by_id(conn, id).await
    }

    pub async fn soft_delete(conn: &Connection, id: &str) -> Result<bool> {
        let affected = conn.execute(
            "UPDATE notebook_notes SET is_deleted = 1, updated_at = ? WHERE id = ?",
            params![Utc::now().to_rfc3339(), id],
        ).await?;
        Ok(affected > 0)
    }

    pub async fn restore(conn: &Connection, id: &str) -> Result<bool> {
        let affected = conn.execute(
            "UPDATE notebook_notes SET is_deleted = 0, updated_at = ? WHERE id = ?",
            params![Utc::now().to_rfc3339(), id],
        ).await?;
        Ok(affected > 0)
    }

    pub async fn permanent_delete(conn: &Connection, id: &str) -> Result<bool> {
        let affected = conn.execute(
            "DELETE FROM notebook_notes WHERE id = ?",
            params![id],
        ).await?;
        Ok(affected > 0)
    }

    pub async fn reorder(conn: &Connection, id: &str, new_position: i64) -> Result<Self> {
        conn.execute(
            "UPDATE notebook_notes SET position = ?, updated_at = ? WHERE id = ?",
            params![new_position, Utc::now().to_rfc3339(), id],
        ).await?;
        Self::find_by_id(conn, id).await
    }

    fn from_row(row: libsql::Row) -> Result<Self> {
        let content_str: String = row.get(3)?;
        let content = serde_json::from_str(&content_str).unwrap_or(Value::String(content_str));
        
        Ok(Self {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            title: row.get(2)?,
            content,
            position: row.get(4)?,
            is_deleted: !matches!(row.get::<i64>(5)?, 0),
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }
}


