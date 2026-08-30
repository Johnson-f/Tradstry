use crate::service::db::raw::{PgPool, query_scalar};
use anyhow::Result;

pub async fn collect_r2_keys(pool: &PgPool, user_id: &str) -> Result<Vec<String>> {
    let keys = query_scalar::<String>(
        "SELECT object_key FROM notebook_media_blobs
         WHERE user_id=$1 AND object_key<>''
         UNION
         SELECT derivative_key FROM notebook_media_blobs
         WHERE user_id=$1 AND derivative_key IS NOT NULL AND derivative_key<>''",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(keys)
}

pub async fn delete_user_by_clerk_uuid(pool: &PgPool, clerk_uuid: &str) -> Result<Option<String>> {
    let deleted = query_scalar::<String>("DELETE FROM users WHERE clerk_uuid = $1 RETURNING id")
        .bind(clerk_uuid)
        .fetch_optional(pool)
        .await?;

    Ok(deleted)
}
