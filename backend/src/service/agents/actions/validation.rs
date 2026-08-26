use crate::service::agents::{AgentActor, AgentError, AgentResult};

use super::{
    AgentActionChange, AgentActionPayload, AgentActionPreview, CreateNotebookNoteAction,
    PlaybookActionPatch, TradeTagAction, UpdatePlaybookAction,
};

pub async fn validate_and_preview(
    pool: &sqlx::PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    payload: AgentActionPayload,
) -> AgentResult<(AgentActionPayload, AgentActionPreview)> {
    let owned: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=$1 AND user_id=$2)")
            .bind(workspace_id)
            .bind(&actor.user_id)
            .fetch_one(pool)
            .await?;
    if !owned {
        return Err(AgentError::NotFound);
    }
    match payload {
        AgentActionPayload::CreateNotebookNote(input) => {
            validate_note(pool, actor, workspace_id, input).await
        }
        AgentActionPayload::UpdatePlaybook(input) => {
            validate_playbook(pool, actor, workspace_id, input).await
        }
        AgentActionPayload::AddTradeTag(input) => {
            validate_tag(pool, actor, workspace_id, input, true).await
        }
        AgentActionPayload::RemoveTradeTag(input) => {
            validate_tag(pool, actor, workspace_id, input, false).await
        }
    }
}

pub async fn hydrate_expected_versions(
    pool: &sqlx::PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    mut payload: AgentActionPayload,
) -> AgentResult<AgentActionPayload> {
    match &mut payload {
        AgentActionPayload::UpdatePlaybook(input) => {
            input.expected_version = sqlx::query_scalar(
                "SELECT COALESCE(NULLIF(hlc,''),updated_at::text) FROM playbooks
                 WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL
                   AND (workspace_id=$3 OR availability='universal')",
            )
            .bind(&input.playbook_id)
            .bind(&actor.user_id)
            .bind(workspace_id)
            .fetch_optional(pool)
            .await?
            .ok_or(AgentError::NotFound)?;
        }
        AgentActionPayload::AddTradeTag(input) | AgentActionPayload::RemoveTradeTag(input) => {
            input.expected_trade_version = sqlx::query_scalar(
                "SELECT COALESCE(NULLIF(hlc,''),updated_at::text) FROM journal_entries
                 WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND deleted_at IS NULL",
            )
            .bind(&input.trade_id)
            .bind(&actor.user_id)
            .bind(workspace_id)
            .fetch_optional(pool)
            .await?
            .ok_or(AgentError::NotFound)?;
        }
        AgentActionPayload::CreateNotebookNote(_) => {}
    }
    Ok(payload)
}

async fn validate_note(
    pool: &sqlx::PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    mut input: CreateNotebookNoteAction,
) -> AgentResult<(AgentActionPayload, AgentActionPreview)> {
    input.title = input.title.trim().to_string();
    input.markdown = input.markdown.trim().to_string();
    normalize_ids(&mut input.trade_ids, 50)?;
    normalize_ids(&mut input.playbook_ids, 20)?;
    if input.title.is_empty()
        || input.title.chars().count() > 200
        || input.markdown.is_empty()
        || input.markdown.chars().count() > 32_000
    {
        return Err(AgentError::Validation(
            "invalid notebook note action".into(),
        ));
    }
    let trade_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM journal_entries WHERE user_id=$1 AND workspace_id=$2
         AND deleted_at IS NULL AND id=ANY($3)",
    )
    .bind(&actor.user_id)
    .bind(workspace_id)
    .bind(&input.trade_ids)
    .fetch_one(pool)
    .await?;
    if trade_count != input.trade_ids.len() as i64 {
        return Err(AgentError::NotFound);
    }
    let playbook_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM playbooks WHERE user_id=$1 AND deleted_at IS NULL AND id=ANY($2)
         AND (workspace_id=$3 OR availability='universal')",
    )
    .bind(&actor.user_id)
    .bind(&input.playbook_ids)
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;
    if playbook_count != input.playbook_ids.len() as i64 {
        return Err(AgentError::NotFound);
    }
    let preview = AgentActionPreview {
        title: "Create notebook note".into(),
        summary: format!("Create “{}” after confirmation.", input.title),
        changes: vec![AgentActionChange {
            field: "note".into(),
            before: None,
            after: input.title.clone(),
        }],
        warnings: vec!["The note is not created until you confirm.".into()],
    };
    Ok((AgentActionPayload::CreateNotebookNote(input), preview))
}

async fn validate_playbook(
    pool: &sqlx::PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    mut input: UpdatePlaybookAction,
) -> AgentResult<(AgentActionPayload, AgentActionPreview)> {
    if input.playbook_id.trim().is_empty()
        || input.expected_version.trim().is_empty()
        || patch_empty(&input.patch)
    {
        return Err(AgentError::Validation(
            "invalid playbook update action".into(),
        ));
    }
    normalize_patch(&mut input.patch)?;
    let row: Option<(String, String, String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT name,entry_rules,exit_rules,position_sizing_rules,
                COALESCE(NULLIF(hlc,''),updated_at::text),additional_rules
         FROM playbooks WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL
           AND (workspace_id=$3 OR availability='universal')",
    )
    .bind(&input.playbook_id)
    .bind(&actor.user_id)
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some((name, entry, exit, sizing, version, additional)) = row else {
        return Err(AgentError::NotFound);
    };
    if version != input.expected_version {
        return Err(AgentError::Conflict);
    }
    let mut changes = Vec::new();
    for (field, before, after) in [
        ("name", Some(name), input.patch.name.clone()),
        ("entry_rules", Some(entry), input.patch.entry_rules.clone()),
        ("exit_rules", Some(exit), input.patch.exit_rules.clone()),
        (
            "position_sizing_rules",
            Some(sizing),
            input.patch.position_sizing_rules.clone(),
        ),
        (
            "additional_rules",
            additional,
            input.patch.additional_rules.clone(),
        ),
    ] {
        if let Some(after) = after {
            changes.push(AgentActionChange {
                field: field.into(),
                before,
                after,
            });
        }
    }
    let preview = AgentActionPreview {
        title: "Update playbook".into(),
        summary: format!(
            "Change {} playbook field(s) after confirmation.",
            changes.len()
        ),
        changes,
        warnings: vec!["Execution stops if the playbook changes before confirmation.".into()],
    };
    Ok((AgentActionPayload::UpdatePlaybook(input), preview))
}

async fn validate_tag(
    pool: &sqlx::PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    mut input: TradeTagAction,
    add: bool,
) -> AgentResult<(AgentActionPayload, AgentActionPreview)> {
    input.trade_id = input.trade_id.trim().to_string();
    input.tag_id = input.tag_id.trim().to_string();
    let version: Option<String> = sqlx::query_scalar(
        "SELECT COALESCE(NULLIF(hlc,''),updated_at::text) FROM journal_entries
         WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND deleted_at IS NULL",
    )
    .bind(&input.trade_id)
    .bind(&actor.user_id)
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some(version) = version else {
        return Err(AgentError::NotFound);
    };
    if version != input.expected_trade_version {
        return Err(AgentError::Conflict);
    }
    let tag_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM tags t JOIN tag_categories c ON c.id=t.category_id
         WHERE t.id=$1 AND t.user_id=$2 AND t.deleted_at IS NULL
           AND (c.availability='all' OR EXISTS(SELECT 1 FROM tag_category_workspace_applicability a
                WHERE a.category_id=c.id AND a.workspace_id=$3)))",
    )
    .bind(&input.tag_id)
    .bind(&actor.user_id)
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;
    if !tag_exists {
        return Err(AgentError::NotFound);
    }
    let preview = AgentActionPreview {
        title: if add {
            "Add trade tag"
        } else {
            "Remove trade tag"
        }
        .into(),
        summary: format!(
            "{} one tag after confirmation.",
            if add { "Add" } else { "Remove" }
        ),
        changes: vec![AgentActionChange {
            field: "tag".into(),
            before: None,
            after: input.tag_id.clone(),
        }],
        warnings: vec!["Execution stops if the trade changes before confirmation.".into()],
    };
    Ok((
        if add {
            AgentActionPayload::AddTradeTag(input)
        } else {
            AgentActionPayload::RemoveTradeTag(input)
        },
        preview,
    ))
}

fn normalize_ids(ids: &mut Vec<String>, max: usize) -> AgentResult<()> {
    for id in ids.iter_mut() {
        *id = id.trim().to_string();
    }
    ids.sort();
    ids.dedup();
    if ids.len() > max || ids.iter().any(String::is_empty) {
        return Err(AgentError::Validation(
            "action contains invalid record ids".into(),
        ));
    }
    Ok(())
}

fn patch_empty(patch: &PlaybookActionPatch) -> bool {
    patch.name.is_none()
        && patch.entry_rules.is_none()
        && patch.exit_rules.is_none()
        && patch.position_sizing_rules.is_none()
        && patch.additional_rules.is_none()
}

fn normalize_patch(patch: &mut PlaybookActionPatch) -> AgentResult<()> {
    for value in [
        &mut patch.name,
        &mut patch.entry_rules,
        &mut patch.exit_rules,
        &mut patch.position_sizing_rules,
        &mut patch.additional_rules,
    ] {
        if let Some(text) = value {
            *text = text.trim().to_string();
        }
        if value.as_ref().is_some_and(String::is_empty) {
            return Err(AgentError::Validation(
                "playbook fields cannot be blank".into(),
            ));
        }
        if value
            .as_ref()
            .is_some_and(|text| text.chars().count() > 8_000)
        {
            return Err(AgentError::Validation("playbook field is too long".into()));
        }
    }
    Ok(())
}
