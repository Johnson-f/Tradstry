use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use log::{info, error, warn};
use chrono::Utc;

/// Supabase Storage configuration
#[derive(Debug, Clone)]
pub struct SupabaseStorageConfig {
    pub project_url: String,
    pub service_role_key: String,
    pub anon_key: String,
    pub bucket_name: String,
}

impl SupabaseStorageConfig {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let project_url = std::env::var("SUPABASE_URL")
            .context("SUPABASE_URL environment variable is required")?;
        let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .context("SUPABASE_SERVICE_ROLE_KEY environment variable is required")?;
        let anon_key = std::env::var("SUPABASE_ANON_KEY")
            .context("SUPABASE_ANON_KEY environment variable is required")?;
        let bucket_name = std::env::var("SUPABASE_IMAGES_BUCKET")
            .unwrap_or_else(|_| "trade-notes".to_string());

        Ok(Self { project_url, service_role_key, anon_key, bucket_name })
    }
}

/// File information stored in our DB (replaces UploadcareFileInfo)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredFileInfo {
    pub path: String,           // storage object path within the bucket
    pub size: i64,              // bytes
    pub original_filename: String,
    pub mime_type: String,
    pub is_image: bool,
}

/// Image upload service using Supabase Storage
pub struct ImageUploadService {
    config: SupabaseStorageConfig,
    http_client: reqwest::Client,
}

impl ImageUploadService {
    /// Create a new image upload service
    pub fn new(config: SupabaseStorageConfig) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Failed to create HTTP client")?;
        // Log non-sensitive config info for diagnostics
        let parsed = reqwest::Url::parse(&config.project_url).ok();
        let host_info = parsed.as_ref().and_then(|u| u.host_str()).unwrap_or("<unknown-host>");
        info!("SupabaseStorage initialized: host='{}' bucket='{}'", host_info, config.bucket_name);

        Ok(ImageUploadService { config, http_client })
    }

    /// Validate file type and size
    pub fn validate_file(&self, file_data: &[u8], filename: &str, content_type: &str) -> Result<()> {
        const MAX_FILE_SIZE: usize = 10 * 1024 * 1024;
        if file_data.len() > MAX_FILE_SIZE {
            return Err(anyhow::anyhow!("File size exceeds maximum allowed size of 10MB"));
        }
        if !content_type.starts_with("image/") {
            return Err(anyhow::anyhow!("Only image files are allowed"));
        }
        let extension = std::path::Path::new(filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        let allowed_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "heic", "heif"];
        if !allowed_extensions.contains(&extension.as_str()) {
            return Err(anyhow::anyhow!("File type '{}' not allowed. Supported formats: {}", extension, allowed_extensions.join(", ")));
        }
        Ok(())
    }

    /// Generate a unique path for the object: {user_id}/{timestamp_uuid}.{ext}
    pub fn generate_object_path(&self, user_id: &str, original_filename: &str) -> String {
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let uuid_short = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let extension = std::path::Path::new(original_filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        if extension.is_empty() {
            format!("{}/{}_{}", user_id, timestamp, uuid_short)
        } else {
            format!("{}/{}_{}.{}", user_id, timestamp, uuid_short, extension)
        }
    }

    /// Upload a file to Supabase Storage. Returns StoredFileInfo with object path
    pub async fn upload_file(&self, user_id: &str, file_data: &[u8], filename: &str, content_type: &str) -> Result<StoredFileInfo> {
        info!("Uploading file to Supabase Storage: {} ({} bytes, {})", filename, file_data.len(), content_type);

        // Validate before attempting upload
        self.validate_file(file_data, filename, content_type)?;

        let object_path = self.generate_object_path(user_id, filename);
        let url = format!("{}/storage/v1/object/{}/{}", self.config.project_url, self.config.bucket_name, object_path);

        info!(
            "Supabase upload request → url='{}' bucket='{}' path='{}' content_type='{}' size={}",
            url,
            self.config.bucket_name,
            object_path,
            content_type,
            file_data.len()
        );

        let response = self.http_client
            .put(&url)
            .header("Authorization", format!("Bearer {}", self.config.service_role_key))
            .header("apikey", self.config.anon_key.clone())
            .header("x-upsert", "true")
            .header("Content-Type", content_type)
            .body(file_data.to_vec())
            .send()
            .await
            .map_err(|e| {
                error!(
                    "HTTP error during Supabase upload: url='{}' bucket='{}' path='{}' error='{}'",
                    url, self.config.bucket_name, object_path, e
                );
                anyhow::anyhow!("Failed to upload file to Supabase Storage: {}", e)
            })?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        info!("Supabase upload response status={} body='{}'", status, text);

        if !status.is_success() {
            error!(
                "Supabase Storage upload failed: status={} url='{}' bucket='{}' path='{}' body='{}'",
                status,
                url,
                self.config.bucket_name,
                object_path,
                text
            );
            return Err(anyhow::anyhow!(
                "Supabase upload failed (status {}): {}",
                status,
                text
            ));
        }

        Ok(StoredFileInfo {
            path: object_path,
            size: file_data.len() as i64,
            original_filename: filename.to_string(),
            mime_type: content_type.to_string(),
            is_image: true,
        })
    }

    /// Generate a signed URL for the given object path
    pub async fn generate_signed_url(&self, object_path: &str, expires_in: i64) -> Result<String> {
        let url = format!("{}/storage/v1/object/sign/{}/{}", self.config.project_url, self.config.bucket_name, object_path);
        let payload = serde_json::json!({ "expiresIn": expires_in });
        
        let response = self.http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.service_role_key))
            .header("apikey", self.config.anon_key.clone())
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&payload)? )
            .send()
            .await
            .map_err(|e| {
                error!("HTTP error during Supabase sign: url='{}' path='{}' error='{}'", url, object_path, e);
                anyhow::anyhow!("Failed to generate signed URL: {}", e)
            })?;

        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        info!("Supabase sign response status={} body='{}'", status, body_text);

        if !status.is_success() {
            error!("Supabase generate signed URL failed: {} - {}", status, body_text);
            return Err(anyhow::anyhow!("Failed to generate signed URL: {} - {}", status, body_text));
        }

        let value: serde_json::Value = serde_json::from_str(&body_text)
            .context("Failed to parse signed URL response")?;
        // Response shape: { signedURL: "/storage/v1/object/sign/..." }
        let signed_url = value.get("signedURL")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("signedUrl").and_then(|v| v.as_str()))
            .ok_or_else(|| anyhow::anyhow!("signedURL missing in response: {}", body_text))?;

        // If the API returns a relative path, prefix with project_url
        let absolute = if signed_url.starts_with("http") { signed_url.to_string() } else { format!("{}{}", self.config.project_url, signed_url) };
        Ok(absolute)
    }

    /// Delete an object from Supabase Storage
    pub async fn delete_file(&self, object_path: &str) -> Result<()> {
        info!("Deleting file from Supabase Storage: {}", object_path);
        let url = format!("{}/storage/v1/object/{}/{}", self.config.project_url, self.config.bucket_name, object_path);
        let response = self.http_client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", self.config.service_role_key))
            .header("apikey", self.config.anon_key.clone())
            .send()
            .await
            .context("Failed to delete file from Supabase Storage")?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            warn!("Failed to delete file: status={} body='{}'", status, text);
        } else {
            info!("File deleted successfully: {} (status={})", object_path, status);
        }
        Ok(())
    }
}

/// Helper function to generate a unique filename (kept for compatibility)
#[allow(dead_code)]
pub fn generate_unique_filename(original_filename: &str) -> String {
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let uuid = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let extension = std::path::Path::new(original_filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    if extension.is_empty() {
        format!("{}_{}", timestamp, uuid)
    } else {
    format!("{}_{}.{}", timestamp, uuid, extension)
    }
}

/// Extract image dimensions from bytes if desired (not used currently). Returns (width,height)
#[allow(dead_code)]
pub fn extract_image_dimensions_from_bytes(_bytes: &[u8]) -> (Option<i32>, Option<i32>) {
    // To keep dependencies minimal, skip decoding and return None; models accept None
    (None, None)
}
