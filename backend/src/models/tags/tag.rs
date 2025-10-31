use anyhow::Result;
use chrono::{DateTime, Utc};
use libsql::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeTag {
    pub id: String,
    pub category: String,
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagRequest {
    pub category: String,
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTagRequest {
    pub category: Option<String>,
    pub name: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TagQuery {
    pub category: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl TradeTag {
    pub async fn create(conn: &Connection, req: CreateTagRequest) -> Result<Self> {
        let id = Uuid::new_v4().to_string();
        // Use SQLite datetime format to match schema default: "YYYY-MM-DD HH:MM:SS"
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "INSERT INTO trade_tags (id, category, name, color, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                id.clone(),
                req.category,
                req.name,
                req.color.as_deref(),  // Option<String> -> Option<&str> for proper NULL handling
                req.description.as_deref(),  // Option<String> -> Option<&str> for proper NULL handling
                now.clone(),
                now
            ],
        )
        .await?;

        Self::find_by_id(conn, &id).await
    }

    pub async fn find_by_id(conn: &Connection, id: &str) -> Result<Self> {
        let stmt = conn
            .prepare("SELECT id, category, name, color, description, created_at, updated_at FROM trade_tags WHERE id = ?")
            .await?;
        let mut rows = stmt.query(params![id]).await?;

        if let Some(row) = rows.next().await? {
            Ok(Self::from_row(&row)?)
        } else {
            anyhow::bail!("Tag not found: {}", id)
        }
    }

    pub async fn find_all(conn: &Connection, query: Option<TagQuery>) -> Result<Vec<Self>> {
        let query = query.unwrap_or_default();
        let limit = query.limit.unwrap_or(100);
        let offset = query.offset.unwrap_or(0);

        if let Some(category) = &query.category {
            let stmt = conn
                .prepare("SELECT id, category, name, color, description, created_at, updated_at FROM trade_tags WHERE category = ? ORDER BY category, name LIMIT ? OFFSET ?")
                .await?;
            let mut rows = stmt.query(params![category.clone(), limit, offset]).await?;

            let mut tags = Vec::new();
            while let Some(row) = rows.next().await? {
                tags.push(Self::from_row(&row)?);
            }
            Ok(tags)
        } else {
            let stmt = conn
                .prepare("SELECT id, category, name, color, description, created_at, updated_at FROM trade_tags ORDER BY category, name LIMIT ? OFFSET ?")
                .await?;
            let mut rows = stmt.query(params![limit, offset]).await?;

            let mut tags = Vec::new();
            while let Some(row) = rows.next().await? {
                tags.push(Self::from_row(&row)?);
            }
            Ok(tags)
        }
    }

    pub async fn find_by_category(conn: &Connection, category: &str) -> Result<Vec<Self>> {
        let stmt = conn
            .prepare("SELECT id, category, name, color, description, created_at, updated_at FROM trade_tags WHERE category = ? ORDER BY name")
            .await?;
        let mut rows = stmt.query(params![category]).await?;

        let mut tags = Vec::new();
        while let Some(row) = rows.next().await? {
            tags.push(Self::from_row(&row)?);
        }

        Ok(tags)
    }

    pub async fn get_categories(conn: &Connection) -> Result<Vec<String>> {
        let stmt = conn
            .prepare("SELECT DISTINCT category FROM trade_tags ORDER BY category")
            .await?;
        let mut rows = stmt.query(params![]).await?;

        let mut categories = Vec::new();
        while let Some(row) = rows.next().await? {
            categories.push(row.get(0)?);
        }

        Ok(categories)
    }

    pub async fn update(conn: &Connection, id: &str, req: UpdateTagRequest) -> Result<Self> {
        // Get existing tag
        let existing = Self::find_by_id(conn, id).await?;
        
        let category = req.category.unwrap_or(existing.category);
        let name = req.name.unwrap_or(existing.name);
        let color = req.color.or(existing.color);
        let description = req.description.or(existing.description);
        // Use SQLite datetime format to match schema: "YYYY-MM-DD HH:MM:SS"
        let updated_at = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "UPDATE trade_tags SET category = ?, name = ?, color = ?, description = ?, updated_at = ? WHERE id = ?",
            params![
                category,
                name,
                color.as_deref(),  // Option<String> -> Option<&str> for proper NULL handling
                description.as_deref(),  // Option<String> -> Option<&str> for proper NULL handling
                updated_at,
                id
            ],
        )
        .await?;

        Self::find_by_id(conn, id).await
    }

    pub async fn delete(conn: &Connection, id: &str) -> Result<bool> {
        let result = conn
            .execute("DELETE FROM trade_tags WHERE id = ?", params![id])
            .await?;

        Ok(result > 0)
    }

    fn from_row(row: &libsql::Row) -> Result<Self> {
        let created_at_str: String = row.get(5)?;
        let updated_at_str: String = row.get(6)?;

        // Helper function to parse datetime that can be in either RFC3339 or SQLite format
        let parse_datetime = |datetime_str: &str, field_name: &str| -> Result<DateTime<Utc>> {
            if datetime_str.contains('T') {
                // RFC3339 format: "2025-10-15T20:55:53.148886+00:00"
                DateTime::parse_from_rfc3339(datetime_str)
                    .map_err(|e| anyhow::anyhow!("Failed to parse {} as RFC3339: {}", field_name, e))
                    .map(|dt| dt.with_timezone(&Utc))
            } else {
                // SQLite datetime format: "2025-10-29 07:17:16"
                chrono::NaiveDateTime::parse_from_str(datetime_str, "%Y-%m-%d %H:%M:%S")
                    .map_err(|e| anyhow::anyhow!("Failed to parse {} as SQLite datetime: {}", field_name, e))
                    .map(|ndt| ndt.and_utc())
            }
        };

        Ok(Self {
            id: row.get(0)?,
            category: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            description: row.get(4)?,
            created_at: parse_datetime(&created_at_str, "created_at")?,
            updated_at: parse_datetime(&updated_at_str, "updated_at")?,
        })
    }
}

impl Default for TagQuery {
    fn default() -> Self {
        Self {
            category: None,
            limit: Some(100),
            offset: Some(0),
        }
    }
}

