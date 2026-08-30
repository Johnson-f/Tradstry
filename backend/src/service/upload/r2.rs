use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};
use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::ChecksumMode;
use aws_sdk_s3::{Client, Config};
use base64::Engine as _;

#[derive(Clone, Debug)]
pub struct StoredObject {
    pub etag: Option<String>,
    pub content_length: i64,
    pub content_type: Option<String>,
    pub checksum_sha256: Option<String>,
    pub metadata_sha256: Option<String>,
}

#[derive(Debug)]
pub struct StreamedObject {
    pub body: ByteStream,
    pub content_length: i64,
    pub content_type: Option<String>,
    pub content_range: Option<String>,
    pub accept_ranges: Option<String>,
    pub etag: Option<String>,
}

/// Cloudflare R2 is S3-compatible. We talk to it with the AWS S3 SDK pointed at
/// the R2 endpoint, using static credentials and region "auto".
#[derive(Clone)]
pub struct R2Client {
    client: Client,
    bucket: String,
}

impl R2Client {
    pub fn from_env() -> Result<Self> {
        let workspace_id = std::env::var("R2_ACCOUNT_ID").context("R2_ACCOUNT_ID must be set")?;
        let access_key_id =
            std::env::var("R2_ACCESS_KEY_ID").context("R2_ACCESS_KEY_ID must be set")?;
        let secret_access_key =
            std::env::var("R2_SECRET_ACCESS_KEY").context("R2_SECRET_ACCESS_KEY must be set")?;
        let bucket = std::env::var("R2_BUCKET").context("R2_BUCKET must be set")?;

        let credentials =
            Credentials::new(access_key_id, secret_access_key, None, None, "tradstry-r2");

        let config = Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new("auto"))
            .endpoint_url(format!("https://{workspace_id}.r2.cloudflarestorage.com"))
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        Ok(Self {
            client: Client::from_conf(config),
            bucket,
        })
    }

    pub async fn put_object(&self, key: &str, body: Vec<u8>, content_type: &str) -> Result<()> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(body))
            .content_type(content_type)
            .send()
            .await
            .with_context(|| format!("Failed to upload object to R2: {key}"))?;
        Ok(())
    }

    pub async fn put_file_if_absent(
        &self,
        key: &str,
        path: &Path,
        content_type: &str,
        content_hash: &str,
        content_length: i64,
    ) -> Result<StoredObject> {
        let checksum = base64::engine::general_purpose::STANDARD
            .encode(hex::decode(content_hash).context("content hash must be hexadecimal")?);
        let body = ByteStream::from_path(path)
            .await
            .with_context(|| format!("Failed to open upload spool for R2: {}", path.display()))?;
        let result = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(body)
            .content_type(content_type)
            .content_length(content_length)
            .checksum_sha256(checksum)
            .metadata("sha256", content_hash)
            .metadata("bytes", content_length.to_string())
            .if_none_match("*")
            .send()
            .await;
        match result {
            Ok(output) => Ok(StoredObject {
                etag: output.e_tag().map(ToOwned::to_owned),
                content_length,
                content_type: Some(content_type.to_string()),
                checksum_sha256: output.checksum_sha256().map(ToOwned::to_owned),
                metadata_sha256: Some(content_hash.to_string()),
            }),
            Err(upload_error) => {
                let existing = self.object_metadata(key).await?.ok_or_else(|| {
                    anyhow::anyhow!("Failed to upload object to R2: {key}: {upload_error}")
                })?;
                anyhow::ensure!(
                    existing.content_length == content_length
                        && existing.metadata_sha256.as_deref() == Some(content_hash),
                    "R2 object conflict for immutable key {key}"
                );
                Ok(existing)
            }
        }
    }

    pub async fn put_file_immutable(
        &self,
        key: &str,
        path: &Path,
        content_type: &str,
        content_hash: &str,
        content_length: i64,
    ) -> Result<StoredObject> {
        self.put_file_if_absent(key, path, content_type, content_hash, content_length)
            .await
    }

    pub async fn object_metadata(&self, key: &str) -> Result<Option<StoredObject>> {
        match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .checksum_mode(ChecksumMode::Enabled)
            .send()
            .await
        {
            Ok(output) => Ok(Some(StoredObject {
                etag: output.e_tag().map(ToOwned::to_owned),
                content_length: output.content_length().unwrap_or_default(),
                content_type: output.content_type().map(ToOwned::to_owned),
                checksum_sha256: output.checksum_sha256().map(ToOwned::to_owned),
                metadata_sha256: output
                    .metadata()
                    .and_then(|metadata| metadata.get("sha256"))
                    .cloned(),
            })),
            Err(error) => {
                let service_error = error.into_service_error();
                if service_error.is_not_found() {
                    Ok(None)
                } else {
                    Err(anyhow::Error::new(service_error))
                        .with_context(|| format!("R2 head_object failed for key {key}"))
                }
            }
        }
    }

    pub async fn delete_object(&self, key: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("Failed to delete object from R2: {key}"))?;
        Ok(())
    }

    /// Download an object's raw bytes from R2.
    pub async fn get_object(&self, key: &str) -> anyhow::Result<Vec<u8>> {
        use anyhow::Context;
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("R2 get_object failed for key {key}"))?;
        let data = resp.body.collect().await.context("R2 body read failed")?;
        Ok(data.into_bytes().to_vec())
    }

    pub async fn get_object_stream(
        &self,
        key: &str,
        range: Option<&str>,
    ) -> anyhow::Result<StreamedObject> {
        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .set_range(range.map(ToOwned::to_owned))
            .send()
            .await
            .with_context(|| format!("R2 get_object failed for key {key}"))?;
        Ok(StreamedObject {
            content_length: response.content_length().unwrap_or_default(),
            content_type: response.content_type().map(ToOwned::to_owned),
            content_range: response.content_range().map(ToOwned::to_owned),
            accept_ranges: response.accept_ranges().map(ToOwned::to_owned),
            etag: response.e_tag().map(ToOwned::to_owned),
            body: response.body,
        })
    }

    /// Generate a time-limited presigned GET URL for an object. This is a local
    /// signing operation (no network round-trip), so it's cheap to call once
    /// per media record on read.
    pub async fn presigned_get_url(&self, key: &str, ttl: Duration) -> Result<String> {
        let presigned = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(PresigningConfig::expires_in(ttl).context("Invalid presigning TTL")?)
            .await
            .with_context(|| format!("Failed to presign R2 object: {key}"))?;
        Ok(presigned.uri().to_string())
    }
}
