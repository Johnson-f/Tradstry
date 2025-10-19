use anyhow::Result;
use libsql::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub content: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub content: Option<String>,
    pub description: Option<Option<String>>,
}

impl NotebookTemplate {
    pub async fn create(conn: &Connection, req: CreateTemplateRequest) -> Result<Self> {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO notebook_templates (id, name, content, description) VALUES (?, ?, ?, ?)",
            params![id.clone(), req.name, req.content, req.description],
        ).await?;
        Self::find_by_id(conn, &id).await
    }

    pub async fn find_by_id(conn: &Connection, id: &str) -> Result<Self> {
        let stmt = conn.prepare(
            "SELECT id, name, content, description, created_at, updated_at FROM notebook_templates WHERE id = ?",
        ).await?;
        let mut rows = stmt.query(params![id]).await?;
        if let Some(row) = rows.next().await? { Ok(Self::from_row(row)?) } else { anyhow::bail!("Template not found") }
    }

    pub async fn find_all(conn: &Connection) -> Result<Vec<Self>> {
        let stmt = conn.prepare(
            "SELECT id, name, content, description, created_at, updated_at FROM notebook_templates ORDER BY created_at DESC",
        ).await?;
        let mut rows = stmt.query(params![]).await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? { out.push(Self::from_row(row)?); }
        Ok(out)
    }

    pub async fn update(conn: &Connection, id: &str, updates: UpdateTemplateRequest) -> Result<Self> {
        let mut sets = Vec::new();
        let mut params_dyn: Vec<String> = Vec::new();
        if let Some(name) = updates.name { sets.push("name = ?".to_string()); params_dyn.push(name); }
        if let Some(content) = updates.content { sets.push("content = ?".to_string()); params_dyn.push(content); }
        if let Some(desc_opt) = updates.description { match desc_opt { Some(desc) => { sets.push("description = ?".to_string()); params_dyn.push(desc); }, None => sets.push("description = NULL".to_string()) } }
        if sets.is_empty() { return Self::find_by_id(conn, id).await; }
        sets.push("updated_at = ?".to_string()); params_dyn.push(chrono::Utc::now().to_rfc3339());
        params_dyn.push(id.to_string());
        let sql = format!("UPDATE notebook_templates SET {} WHERE id = ?", sets.join(", "));
        match params_dyn.len() {
            1 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), id]).await?; }
            2 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), params_dyn[1].as_str(), id]).await?; }
            3 => { conn.execute(sql.as_str(), params![params_dyn[0].as_str(), params_dyn[1].as_str(), params_dyn[2].as_str(), id]).await?; }
            _ => { conn.execute(sql.as_str(), params![id]).await?; }
        }
        Self::find_by_id(conn, id).await
    }

    pub async fn delete(conn: &Connection, id: &str) -> Result<bool> {
        let affected = conn.execute("DELETE FROM notebook_templates WHERE id = ?", params![id]).await?;
        Ok(affected > 0)
    }

    fn from_row(row: libsql::Row) -> Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            content: row.get(2)?,
            description: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }
}


