//! Idempotent writes. A caller names each logical write with a client id and a
//! mutation id; replaying the same pair returns the stored result instead of
//! writing again. The rows live in `journal_mutations`, which holds nothing
//! journal-specific.

use anyhow::{Result, ensure};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, Row};

pub fn hash(payload: &Value) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(payload)?)
    ))
}

/// The stored result of this mutation, if it already ran. Takes a transaction
/// advisory lock on the mutation identity, so call it inside the transaction that
/// will `acknowledge` the write.
pub async fn replay(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    client: &str,
    mutation: &str,
    payload: &Value,
) -> Result<Option<Value>> {
    ensure!(
        !client.is_empty() && client.len() <= 128 && !mutation.is_empty() && mutation.len() <= 128,
        "Invalid mutation identity"
    );
    let key = hash(&serde_json::json!([user, client, mutation]))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(key)
        .execute(&mut *connection)
        .await?;
    let row=sqlx::query("SELECT workspace_id,payload_hash,result_json FROM journal_mutations WHERE user_id=$1 AND client_id=$2 AND mutation_id=$3")
        .bind(user).bind(client).bind(mutation).fetch_optional(connection).await?;
    if let Some(row) = row {
        ensure!(
            row.try_get::<String, _>("workspace_id")? == workspace
                && row.try_get::<String, _>("payload_hash")? == hash(payload)?,
            "IDEMPOTENCY_CONFLICT: this mutation identity was used for another change"
        );
        return Ok(Some(row.try_get("result_json")?));
    }
    Ok(None)
}

pub async fn acknowledge(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    client: &str,
    mutation: &str,
    payload: &Value,
    result: &Value,
) -> Result<()> {
    sqlx::query("INSERT INTO journal_mutations(id,user_id,workspace_id,client_id,mutation_id,payload_hash,result_json) VALUES ($1,$2,$3,$4,$5,$6,$7)")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(user).bind(workspace).bind(client).bind(mutation).bind(hash(payload)?).bind(result).execute(connection).await?;
    Ok(())
}
