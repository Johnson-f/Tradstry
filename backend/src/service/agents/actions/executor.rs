use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use uuid::Uuid;

use super::AgentActionPayload;
use crate::service::agents::{AgentActionExecutionJob, AgentError, AgentResult, AgentService};
use crate::service::db::schema::tables::{
    notebook::notes::{self, CreateNotebookNoteInput},
    playbook_table, tags_table,
};

pub async fn run_action_worker(
    service: Arc<AgentService>,
    worker_index: usize,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("action-worker-{}-{worker_index}", Uuid::new_v4());
    loop {
        if *shutdown.borrow() {
            return;
        }
        match service
            .store()
            .claim_action_execution(&owner, service.config().run_lease_seconds)
            .await
        {
            Ok(Some(job)) => {
                if let Err(error) = execute(&service, &job, &owner).await {
                    let code = if matches!(error, AgentError::Conflict) {
                        "record_changed"
                    } else {
                        "action_execution_failed"
                    };
                    log::warn!(
                        "[agents] action execution {} failed with {code}: {error}",
                        job.id
                    );
                    let _ = service
                        .store()
                        .fail_action_execution(&job.id, &owner, code)
                        .await;
                }
            }
            Ok(None) => tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(3)) => {},
                _ = shutdown.changed() => {},
            },
            Err(error) => {
                log::warn!("[agents] action worker claim failed: {error}");
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {},
                    _ = shutdown.changed() => {},
                }
            }
        }
    }
}

pub async fn execute(
    service: &AgentService,
    job: &AgentActionExecutionJob,
    lease_owner: &str,
) -> AgentResult<()> {
    let mut tx = service.store().pool().begin().await?;
    let still_claimed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM agent_action_executions
         WHERE id=$1 AND lease_owner=$2 AND status='running' FOR UPDATE)",
    )
    .bind(&job.id)
    .bind(lease_owner)
    .fetch_one(&mut *tx)
    .await?;
    if !still_claimed {
        return Err(AgentError::Conflict);
    }
    let affected = match &job.proposal.payload {
        AgentActionPayload::CreateNotebookNote(input) => {
            let markdown = format!("# {}\n\n{}", input.title, input.markdown);
            let document_json = crate::service::notebook::projector::markdown_to_json(&markdown)
                .await
                .map_err(|_| AgentError::Internal)?;
            let note_id =
                Uuid::new_v5(&Uuid::NAMESPACE_URL, job.proposal.id.as_bytes()).to_string();
            let created = notes::create_notebook_note_tx(
                &mut tx,
                &job.proposal.user_id,
                CreateNotebookNoteInput {
                    id: Some(note_id.clone()),
                    workspace_id: job.proposal.workspace_id.clone(),
                    document_json,
                    trade_ids: input.trade_ids.clone(),
                    folder_id: None,
                },
                &crate::service::hlc::stamp(),
            )
            .await
            .map_err(|error| {
                log::warn!("confirmed note action failed: {error:#}");
                AgentError::Internal
            })?;
            json!([{"type":"notebook_note","id":created}])
        }
        AgentActionPayload::UpdatePlaybook(input) => {
            let version = playbook_table::update_playbook_if_version_tx(
                &mut tx,
                &job.proposal.user_id,
                &job.proposal.workspace_id,
                &input.playbook_id,
                &input.expected_version,
                playbook_table::PlaybookVersionedPatch {
                    name: input.patch.name.as_deref(),
                    entry_rules: input.patch.entry_rules.as_deref(),
                    exit_rules: input.patch.exit_rules.as_deref(),
                    position_sizing_rules: input.patch.position_sizing_rules.as_deref(),
                    additional_rules: input.patch.additional_rules.as_deref(),
                },
            )
            .await
            .map_err(|error| {
                if error.to_string().contains("record_changed") {
                    AgentError::Conflict
                } else {
                    AgentError::Internal
                }
            })?;
            json!([{"type":"playbook","id":input.playbook_id,"version":version}])
        }
        AgentActionPayload::AddTradeTag(input) | AgentActionPayload::RemoveTradeTag(input) => {
            let add = matches!(&job.proposal.payload, AgentActionPayload::AddTradeTag(_));
            tags_table::set_trade_tag_membership_if_version_tx(
                &mut tx,
                &job.proposal.user_id,
                &job.proposal.workspace_id,
                &input.trade_id,
                &input.tag_id,
                &input.expected_trade_version,
                add,
            )
            .await
            .map_err(|error| {
                if error.to_string().contains("record_changed") {
                    AgentError::Conflict
                } else {
                    AgentError::Internal
                }
            })?;
            json!([{"type":"journal_entry","id":input.trade_id,"tagId":input.tag_id,"operation":if add{"add"}else{"remove"}}])
        }
    };
    let updated = sqlx::query(
        "UPDATE agent_action_executions SET status='completed',outcome_json=$3,
         affected_records_json=$4,completed_at=now(),updated_at=now(),lease_owner=NULL,
         leased_at=NULL,heartbeat_at=NULL WHERE id=$1 AND lease_owner=$2 AND status='running'",
    )
    .bind(&job.id)
    .bind(lease_owner)
    .bind(json!({"ok":true}))
    .bind(&affected)
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(AgentError::Conflict);
    }
    sqlx::query(
        "UPDATE agent_action_proposals SET status='executed',executed_at=now(),updated_at=now()
         WHERE id=$1 AND status='approved'",
    )
    .bind(&job.proposal.id)
    .execute(&mut *tx)
    .await?;
    let sequence: i64 = sqlx::query_scalar(
        "SELECT COALESCE(max(sequence),0)+1 FROM agent_messages WHERE conversation_id=$1",
    )
    .bind(&job.proposal.conversation_id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO agent_messages(id,conversation_id,user_id,workspace_id,sequence,role,content_json)
         VALUES($1,$2,$3,$4,$5,'action',$6)",
    ).bind(Uuid::new_v4().to_string()).bind(&job.proposal.conversation_id)
      .bind(&job.proposal.user_id).bind(&job.proposal.workspace_id).bind(sequence)
      .bind(json!({"proposalId":job.proposal.id,"status":"executed","affected":affected}))
      .execute(&mut *tx).await?;
    tx.commit().await?;
    service.wake_handle().notify_waiters();
    Ok(())
}
