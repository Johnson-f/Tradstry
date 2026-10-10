use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgConnection, Row};

pub(super) use crate::service::mutations::{acknowledge, hash, replay};

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
