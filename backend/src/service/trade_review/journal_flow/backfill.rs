use super::{commands, source};
use anyhow::{Result, anyhow, ensure};
use async_graphql::SimpleObject;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgConnection, PgPool, Row};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalPreparationV2", rename_fields = "camelCase")]
pub struct Preparation {
    pub source_revision: i64,
    pub broker_records: i64,
    pub existing_entries: i64,
    pub linked_entries: i64,
    pub ready_trades: i64,
    pub attention_groups: i64,
    pub conflicting_links: i64,
    pub first_execution: Option<String>,
    pub timezone: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalActivationV2", rename_fields = "camelCase")]
pub struct Activation {
    pub enabled: bool,
    pub source_revision: i64,
    pub queued: bool,
}

pub async fn prepare(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    flat_before: Option<&str>,
) -> Result<Preparation> {
    let mut connection = pool.acquire().await?;
    prepare_connection(&mut connection, user, workspace, flat_before).await
}

async fn prepare_connection(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    flat_before: Option<&str>,
) -> Result<Preparation> {
    let date = flat_before.map(DateTime::parse_from_rfc3339).transpose()?;
    let row=sqlx::query("SELECT w.journal_timezone,coalesce(s.source_revision,0) AS revision,coalesce(s.enabled,false) AS enabled,
        (SELECT count(*) FROM brokerage_transactions WHERE user_id=w.user_id AND workspace_id=w.id) AS broker_records,
        (SELECT min(trade_date) FROM brokerage_transactions WHERE user_id=w.user_id AND workspace_id=w.id) AS first_execution,
        (SELECT count(*) FROM journal_entries WHERE user_id=w.user_id AND workspace_id=w.id) AS existing_entries,
        (SELECT count(DISTINCT j.id) FROM journal_entries j JOIN journal_brokerage_links l ON l.journal_entry_id=j.id AND l.user_id=j.user_id WHERE j.user_id=w.user_id AND j.workspace_id=w.id) AS linked_entries,
        (SELECT count(DISTINCT j.id) FROM journal_entries j JOIN journal_brokerage_links l ON l.journal_entry_id=j.id LEFT JOIN brokerage_transactions b ON b.id=l.brokerage_transaction_id WHERE j.user_id=w.user_id AND j.workspace_id=w.id AND (b.id IS NULL OR b.user_id<>w.user_id OR b.workspace_id<>w.id OR l.user_id<>w.user_id)) AS conflicting_links,
        coalesce(s.opening_inventory,'{}') AS inventory
        FROM workspaces w LEFT JOIN journal_workspace_state s ON s.workspace_id=w.id AND s.user_id=w.user_id WHERE w.id=$1 AND w.user_id=$2")
        .bind(workspace).bind(user).fetch_optional(&mut *connection).await?.ok_or_else(||anyhow!("Workspace not found"))?;
    let first: Option<DateTime<Utc>> = row.try_get("first_execution")?;
    if let (Some(date), Some(first)) = (date, first) {
        ensure!(
            date <= first,
            "The flat-account checkpoint must precede the imported executions"
        );
    }
    let inventory = if let Some(date) = date {
        json!({"*":{"kind":"flat","as_of":date.to_rfc3339(),"provenance":"user_confirmed"}})
    } else {
        row.try_get("inventory")?
    };
    let groups = source::load(connection, user, workspace).await?;
    let mut ready = 0;
    let mut attention = 0;
    for group in groups {
        let drafts = group.drafts(&inventory)?;
        if drafts.is_empty() {
            attention += 1;
        } else {
            ready += drafts.len() as i64;
        }
    }
    Ok(Preparation {
        source_revision: row.try_get("revision")?,
        broker_records: row.try_get("broker_records")?,
        existing_entries: row.try_get("existing_entries")?,
        linked_entries: row.try_get("linked_entries")?,
        ready_trades: ready,
        attention_groups: attention,
        conflicting_links: row.try_get("conflicting_links")?,
        first_execution: first.map(|date| date.to_rfc3339()),
        timezone: row.try_get("journal_timezone")?,
        enabled: row.try_get("enabled")?,
    })
}

pub struct ActivationInput<'a> {
    pub expected_revision: i64,
    pub flat_before: Option<&'a str>,
    pub timezone: &'a str,
}

pub async fn enable(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: ActivationInput<'_>,
    client: &str,
    mutation: &str,
) -> Result<Activation> {
    let ActivationInput {
        expected_revision,
        flat_before,
        timezone,
    } = input;
    timezone
        .parse::<chrono_tz::Tz>()
        .map_err(|_| anyhow!("Choose a valid journal timezone"))?;
    let payload = json!({"kind":"enable_journal","workspace":workspace,"revision":expected_revision,"flatBefore":flat_before,"timezone":timezone});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    let report = prepare_connection(&mut tx, user, workspace, flat_before).await?;
    ensure!(
        report.conflicting_links == 0,
        "Existing journal links need reconciliation before this workspace can be enabled"
    );
    sqlx::query("INSERT INTO journal_workspace_state(workspace_id,user_id) SELECT id,user_id FROM workspaces WHERE id=$1 AND user_id=$2 ON CONFLICT(workspace_id) DO NOTHING").bind(workspace).bind(user).execute(&mut *tx).await?;
    let revision:Option<i64>=sqlx::query_scalar("SELECT source_revision FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2 AND import_state='idle' FOR UPDATE").bind(workspace).bind(user).fetch_optional(&mut *tx).await?;
    ensure!(
        revision == Some(expected_revision),
        "REPREVIEW_REQUIRED: broker history changed; prepare the journal again"
    );
    let mut inventory:serde_json::Value=sqlx::query_scalar("SELECT opening_inventory FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2").bind(workspace).bind(user).fetch_one(&mut *tx).await?;
    if let Some(date) = flat_before {
        inventory["*"] = json!({"kind":"flat","as_of":DateTime::parse_from_rfc3339(date)?.to_rfc3339(),"provenance":"user_confirmed","recorded_at":Utc::now().to_rfc3339()});
    }
    let inserted=sqlx::query("INSERT INTO brokerage_transaction_versions(id,transaction_id,user_id,workspace_id,source_revision,operation,record_json)
        SELECT uuidv7()::text,b.id,b.user_id,b.workspace_id,$3+row_number() OVER(ORDER BY b.id),'baseline',to_jsonb(b)
        FROM brokerage_transactions b WHERE b.user_id=$1 AND b.workspace_id=$2 AND NOT EXISTS(SELECT 1 FROM brokerage_transaction_versions v WHERE v.transaction_id=b.id AND v.user_id=b.user_id AND v.workspace_id=b.workspace_id)")
        .bind(user).bind(workspace).bind(expected_revision).execute(&mut *tx).await?.rows_affected();
    let source_revision = expected_revision + i64::try_from(inserted)?;
    sqlx::query("UPDATE workspaces SET journal_timezone=$3 WHERE id=$1 AND user_id=$2")
        .bind(workspace)
        .bind(user)
        .bind(timezone)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE journal_workspace_state SET enabled=true,source_revision=$3,sealed_revision=$3,import_state='idle',opening_inventory=$4,last_error=NULL WHERE workspace_id=$1 AND user_id=$2")
        .bind(workspace).bind(user).bind(source_revision).bind(inventory).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO journal_projection_jobs(workspace_id,user_id,requested_revision,state) VALUES ($1,$2,$3,'pending') ON CONFLICT(workspace_id) DO UPDATE SET requested_revision=EXCLUDED.requested_revision,state='pending',lease_owner=NULL,lease_until=NULL,available_at=now()")
        .bind(workspace).bind(user).bind(source_revision).execute(&mut *tx).await?;
    let result = Activation {
        enabled: true,
        source_revision,
        queued: true,
    };
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &serde_json::to_value(&result)?,
    )
    .await?;
    tx.commit().await?;
    Ok(result)
}
