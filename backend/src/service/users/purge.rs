use crate::service::db::raw::{PgPool, query_scalar};
use crate::service::upload::r2::R2Client;
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

/// Removes the user's R2 objects, then the user row and everything it owns. The
/// keys are only reachable through rows the delete removes, so the objects go
/// first and a failure leaves the account intact to retry.
pub async fn purge_user(pool: &PgPool, r2: &R2Client, user_id: &str) -> Result<bool> {
    for key in collect_r2_keys(pool, user_id).await? {
        r2.delete_object(&key).await?;
    }
    let deleted = query_scalar::<String>("DELETE FROM users WHERE id = $1 RETURNING id")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    Ok(deleted.is_some())
}
