use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use libsql::{Connection, params};

/// Image model for storing image metadata associated with trade notes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Image {
    pub id: String,
    pub trade_note_id: String,
    pub uploadcare_file_id: String,
    pub original_filename: String,
    pub mime_type: String,
    pub file_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub alt_text: Option<String>,
    pub caption: Option<String>,
    pub position_in_note: Option<i32>, // Order of image in the note
    pub is_deleted: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data Transfer Object for creating new images
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateImageRequest {
    pub trade_note_id: String,
    pub uploadcare_file_id: String,
    pub original_filename: String,
    pub mime_type: String,
    pub file_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub alt_text: Option<String>,
    pub caption: Option<String>,
    pub position_in_note: Option<i32>,
}

/// Data Transfer Object for updating images
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateImageRequest {
    pub alt_text: Option<String>,
    pub caption: Option<String>,
    pub position_in_note: Option<i32>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

/// Image query parameters for filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageQuery {
    pub trade_note_id: Option<String>,
    pub mime_type: Option<String>,
    pub is_deleted: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Image operations implementation using libsql
impl Image {
    /// Create a new image in the user's database
    pub async fn create(
        conn: &Connection,
        request: CreateImageRequest,
    ) -> Result<Image, Box<dyn std::error::Error + Send + Sync>> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        let mut rows = conn.prepare(
            r#"
            INSERT INTO images (
                id, trade_note_id, uploadcare_file_id, original_filename, 
                mime_type, file_size, width, height, alt_text, caption, 
                position_in_note, is_deleted, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, trade_note_id, uploadcare_file_id, original_filename,
                     mime_type, file_size, width, height, alt_text, caption,
                     position_in_note, is_deleted, created_at, updated_at
            "#,
        )
        .await?
.query(params![
            id,
            request.trade_note_id,
            request.uploadcare_file_id,
            request.original_filename,
            request.mime_type,
            request.file_size,
            request.width,
            request.height,
            request.alt_text,
            request.caption,
            request.position_in_note,
            false, // is_deleted
            now.clone(),
            now
        ])
        .await?;

        if let Some(row) = rows.next().await? {
            Ok(Image::from_row(&row)?)
        } else {
            Err("Failed to create image".into())
        }
    }

    /// Find an image by ID in the user's database
    pub async fn find_by_id(
        conn: &Connection,
        image_id: &str,
    ) -> Result<Option<Image>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
                r#"
                SELECT id, trade_note_id, uploadcare_file_id, original_filename,
                       mime_type, file_size, width, height, alt_text, caption,
                       position_in_note, is_deleted, created_at, updated_at
                FROM images 
                WHERE id = ? AND is_deleted = 0
                "#,
            )
            .await?
            .query(params![image_id])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Image::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Find all images for a specific trade note
    pub async fn find_by_trade_note_id(
        conn: &Connection,
        trade_note_id: &str,
    ) -> Result<Vec<Image>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
                r#"
                SELECT id, trade_note_id, uploadcare_file_id, original_filename,
                       mime_type, file_size, width, height, alt_text, caption,
                       position_in_note, is_deleted, created_at, updated_at
                FROM images 
                WHERE trade_note_id = ? AND is_deleted = 0
                ORDER BY position_in_note ASC, created_at ASC
                "#,
            )
            .await?
            .query(params![trade_note_id])
            .await?;

        let mut images = Vec::new();
        while let Some(row) = rows.next().await? {
            images.push(Image::from_row(&row)?);
        }

        Ok(images)
    }

    /// Find all images with optional filtering
    pub async fn find_all(
        conn: &Connection,
        query: ImageQuery,
    ) -> Result<Vec<Image>, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = String::from(
            r#"
            SELECT id, trade_note_id, uploadcare_file_id, original_filename,
                   mime_type, file_size, width, height, alt_text, caption,
                   position_in_note, is_deleted, created_at, updated_at
            FROM images 
            WHERE 1=1
            "#,
        );
        
        let mut query_params = Vec::new();
        
        // Add optional filters
        if let Some(trade_note_id) = &query.trade_note_id {
            sql.push_str(" AND trade_note_id = ?");
            query_params.push(libsql::Value::Text(trade_note_id.clone()));
        }
        
        if let Some(mime_type) = &query.mime_type {
            sql.push_str(" AND mime_type = ?");
            query_params.push(libsql::Value::Text(mime_type.clone()));
        }
        
        if let Some(is_deleted) = query.is_deleted {
            sql.push_str(" AND is_deleted = ?");
            query_params.push(libsql::Value::Integer(if is_deleted { 1 } else { 0 }));
        } else {
            sql.push_str(" AND is_deleted = 0");
        }

        sql.push_str(" ORDER BY created_at DESC");

        // Add pagination
        if let Some(limit) = query.limit {
            sql.push_str(" LIMIT ?");
            query_params.push(libsql::Value::Integer(limit));
        }
        
        if let Some(offset) = query.offset {
            sql.push_str(" OFFSET ?");
            query_params.push(libsql::Value::Integer(offset));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        let mut images = Vec::new();
        while let Some(row) = rows.next().await? {
            images.push(Image::from_row(&row)?);
        }

        Ok(images)
    }

    /// Update an image
    pub async fn update(
        conn: &Connection,
        image_id: &str,
        request: UpdateImageRequest,
    ) -> Result<Option<Image>, Box<dyn std::error::Error + Send + Sync>> {
        // Check if image exists first
        let current_image = Self::find_by_id(conn, image_id).await?;
        
        if current_image.is_none() {
            return Ok(None);
        }

        let now = Utc::now().to_rfc3339();

        let mut rows = conn
            .prepare(
                r#"
                UPDATE images SET 
                    alt_text = COALESCE(?, alt_text),
                    caption = COALESCE(?, caption),
                    position_in_note = COALESCE(?, position_in_note),
                    width = COALESCE(?, width),
                    height = COALESCE(?, height),
                    updated_at = ?
                WHERE id = ? AND is_deleted = 0
                RETURNING id, trade_note_id, uploadcare_file_id, original_filename,
                         mime_type, file_size, width, height, alt_text, caption,
                         position_in_note, is_deleted, created_at, updated_at
                "#,
            )
            .await?
.query(params![
                request.alt_text,
                request.caption,
                request.position_in_note,
                request.width,
                request.height,
                now,
                image_id
            ])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Image::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Soft delete an image (mark as deleted)
    pub async fn delete(
        conn: &Connection,
        image_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let now = Utc::now().to_rfc3339();
        
        let result = conn
            .execute(
                r#"
                UPDATE images SET 
                    is_deleted = 1,
                    updated_at = ?
                WHERE id = ? AND is_deleted = 0
                "#,
params![now, image_id],
            )
            .await?;

        Ok(result > 0)
    }

    /// Get total count of images (for pagination)
    pub async fn count(
        conn: &Connection,
        query: &ImageQuery,
    ) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = String::from("SELECT COUNT(*) FROM images WHERE 1=1");
        let mut query_params = Vec::new();
        
        // Add the same filters as in find_all
        if let Some(trade_note_id) = &query.trade_note_id {
            sql.push_str(" AND trade_note_id = ?");
            query_params.push(libsql::Value::Text(trade_note_id.clone()));
        }
        
        if let Some(mime_type) = &query.mime_type {
            sql.push_str(" AND mime_type = ?");
            query_params.push(libsql::Value::Text(mime_type.clone()));
        }
        
        if let Some(is_deleted) = query.is_deleted {
            sql.push_str(" AND is_deleted = ?");
            query_params.push(libsql::Value::Integer(if is_deleted { 1 } else { 0 }));
        } else {
            sql.push_str(" AND is_deleted = 0");
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<i64>(0)?)
        } else {
            Ok(0)
        }
    }

    /// Get total count of all images
    pub async fn total_count(conn: &Connection) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare("SELECT COUNT(*) FROM images WHERE is_deleted = 0")
            .await?
            .query(params![])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<i64>(0)?)
        } else {
            Ok(0)
        }
    }

    /// Convert from libsql row to Image struct
    fn from_row(row: &libsql::Row) -> Result<Image, Box<dyn std::error::Error + Send + Sync>> {
        let created_at_str: String = row.get(12)?;
        let updated_at_str: String = row.get(13)?;
        
        let created_at = DateTime::parse_from_rfc3339(&created_at_str)
            .map_err(|e| format!("Failed to parse created_at: {}", e))?
            .with_timezone(&Utc);
        
        let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
            .map_err(|e| format!("Failed to parse updated_at: {}", e))?
            .with_timezone(&Utc);
        
        Ok(Image {
            id: row.get(0)?,
            trade_note_id: row.get(1)?,
            uploadcare_file_id: row.get(2)?,
            original_filename: row.get(3)?,
            mime_type: row.get(4)?,
            file_size: row.get(5)?,
            width: row.get(6)?,
            height: row.get(7)?,
            alt_text: row.get(8)?,
            caption: row.get(9)?,
            position_in_note: row.get(10)?,
            is_deleted: {
                let val: i64 = row.get(11)?;
                val != 0
            },
            created_at,
            updated_at,
        })
    }
}