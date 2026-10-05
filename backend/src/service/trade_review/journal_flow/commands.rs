use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, Row};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct WorkspaceVersion {
    pub source: i64,
    pub grouping: i64,
}

pub(super) async fn lock_owner(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<()> {
    let found:Option<String>=sqlx::query_scalar("SELECT workspace_id FROM journal_workspace_state WHERE user_id=$1 AND workspace_id=$2 AND enabled FOR UPDATE")
        .bind(user).bind(workspace).fetch_optional(connection).await?;
    ensure!(found.is_some(), "Journal workspace not found");
    Ok(())
}

pub(super) async fn lock_workspace(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<WorkspaceVersion> {
    let row=sqlx::query("SELECT source_revision,grouping_revision,projection_revision,sealed_revision,import_state FROM journal_workspace_state WHERE user_id=$1 AND workspace_id=$2 AND enabled FOR UPDATE")
        .bind(user).bind(workspace).fetch_optional(&mut *connection).await?.ok_or_else(||anyhow::anyhow!("Journal workspace not found"))?;
    let source: i64 = row.try_get("source_revision")?;
    ensure!(
        row.try_get::<String, _>("import_state")? == "idle"
            && row.try_get::<i64, _>("sealed_revision")? == source
            && row.try_get::<i64, _>("projection_revision")? == source,
        "REPREVIEW_REQUIRED: wait for the current sync to finish"
    );
    sqlx::query("SELECT set_config('tradstry.journal_writer','on',true)")
        .execute(connection)
        .await?;
    Ok(WorkspaceVersion {
        source,
        grouping: row.try_get("grouping_revision")?,
    })
}

pub(super) fn hash(payload: &Value) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(payload)?)
    ))
}

pub(super) async fn replay(
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

pub(super) async fn acknowledge(
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

pub(super) async fn changed(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    kind: &str,
    payload: Value,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO journal_changes(user_id,workspace_id,kind,payload_json) VALUES ($1,$2,$3,$4)",
    )
    .bind(user)
    .bind(workspace)
    .bind(kind)
    .bind(payload)
    .execute(connection)
    .await?;
    Ok(())
}
