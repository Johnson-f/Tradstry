use std::collections::HashSet;
use std::sync::Arc;

use serde_json::json;
use tokio::sync::Notify;

use super::knowledge::KnowledgeService;
use super::runtime::AgentModelRegistry;
use super::{
    AgentActor, AgentBudget, AgentCapabilities, AgentConfig, AgentContextKind,
    AgentContextSearchResult, AgentConversation, AgentError, AgentMessage, AgentMessageContext,
    AgentResult, AgentRun, AgentRunEvent, AgentRunHandle, AgentScope, AgentStore, ModelProvider,
    SendAgentMessage,
};

const MAX_MESSAGE_CHARS: usize = 32_000;
const MAX_CONTEXT_REFERENCES: usize = 30;

#[derive(Clone)]
pub struct AgentService {
    config: AgentConfig,
    store: AgentStore,
    budget: AgentBudget,
    models: Option<AgentModelRegistry>,
    knowledge: Option<Arc<KnowledgeService>>,
    r2: Option<Arc<crate::service::r2::R2Client>>,
    wake: Arc<Notify>,
}

impl AgentService {
    pub fn from_parts(
        config: AgentConfig,
        store: AgentStore,
        models: Option<AgentModelRegistry>,
    ) -> Self {
        Self {
            budget: AgentBudget::new(store.pool().clone()),
            config,
            store,
            models,
            knowledge: None,
            r2: None,
            wake: Arc::new(Notify::new()),
        }
    }

    pub async fn from_env(db: &crate::service::db::Db) -> AgentResult<Self> {
        let config = AgentConfig::from_env()?;
        let models = if config.enabled {
            Some(AgentModelRegistry::from_config(&config).await?)
        } else {
            None
        };
        Ok(Self::from_parts(
            config,
            AgentStore::new(db.pool().clone()),
            models,
        ))
    }

    pub fn with_knowledge(mut self, knowledge: Arc<KnowledgeService>) -> Self {
        self.knowledge = Some(knowledge);
        self
    }

    pub fn with_r2(mut self, r2: Arc<crate::service::r2::R2Client>) -> Self {
        self.r2 = Some(r2);
        self
    }

    pub fn config(&self) -> &AgentConfig {
        &self.config
    }

    pub fn store(&self) -> &AgentStore {
        &self.store
    }

    pub fn budget(&self) -> &AgentBudget {
        &self.budget
    }

    pub fn models(&self) -> Option<&AgentModelRegistry> {
        self.models.as_ref()
    }

    pub fn knowledge(&self) -> Option<&Arc<KnowledgeService>> {
        self.knowledge.as_ref()
    }

    pub fn r2(&self) -> Option<&Arc<crate::service::r2::R2Client>> {
        self.r2.as_ref()
    }

    pub fn wake_handle(&self) -> Arc<Notify> {
        Arc::clone(&self.wake)
    }

    pub fn capabilities(&self) -> AgentCapabilities {
        AgentCapabilities {
            enabled: self.config.enabled,
            runtime_version: env!("CARGO_PKG_VERSION").into(),
            turn_runtime: true,
            model_roles_ready: self.models.is_some(),
            memory: true,
            actions: true,
            notebook_assistance: true,
        }
    }

    fn ensure_enabled(&self) -> AgentResult<()> {
        if self.config.enabled {
            Ok(())
        } else {
            Err(AgentError::Disabled)
        }
    }

    pub async fn create_conversation(
        &self,
        actor: &AgentActor,
        scope: &AgentScope,
    ) -> AgentResult<AgentConversation> {
        self.ensure_enabled()?;
        self.store.create_conversation(actor, scope).await
    }

    pub async fn list_conversations(
        &self,
        actor: &AgentActor,
        scope: &AgentScope,
        limit: i64,
    ) -> AgentResult<Vec<AgentConversation>> {
        self.ensure_enabled()?;
        self.store.list_conversations(actor, scope, limit).await
    }

    pub async fn search_context(
        &self,
        actor: &AgentActor,
        workspace_id: &str,
        query: &str,
        limit: i64,
    ) -> AgentResult<Vec<AgentContextSearchResult>> {
        self.ensure_enabled()?;
        super::context::search(self.store.pool(), actor, workspace_id, query, limit).await
    }

    pub async fn rename_conversation(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
        title: &str,
    ) -> AgentResult<AgentConversation> {
        self.ensure_enabled()?;
        self.store
            .rename_conversation(actor, conversation_id, title)
            .await
    }

    pub async fn delete_conversation(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
    ) -> AgentResult<bool> {
        self.ensure_enabled()?;
        self.store.delete_conversation(actor, conversation_id).await
    }

    pub async fn list_messages(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
        limit: i64,
    ) -> AgentResult<Vec<AgentMessage>> {
        self.ensure_enabled()?;
        self.store
            .list_messages(actor, conversation_id, limit)
            .await
    }

    pub async fn send_message(
        &self,
        actor: &AgentActor,
        input: SendAgentMessage,
    ) -> AgentResult<AgentRunHandle> {
        self.ensure_enabled()?;
        let content = input.content.trim();
        if content.is_empty() || content.chars().count() > MAX_MESSAGE_CHARS {
            return Err(AgentError::Validation(format!(
                "message must contain 1 to {MAX_MESSAGE_CHARS} characters"
            )));
        }
        validate_context_references(&input.context)?;
        self.validate_provider_media_context(actor, &input).await?;
        let enqueued = self
            .store
            .enqueue_message_run(
                actor,
                &input.conversation_id,
                &json!({ "text": content, "context": input.context }),
                &input.idempotency_key,
            )
            .await?;
        if enqueued.created {
            self.wake.notify_one();
        }
        Ok(AgentRunHandle {
            run_id: enqueued.run.id,
            conversation_id: enqueued.run.conversation_id,
            status: enqueued.run.status,
        })
    }

    async fn validate_provider_media_context(
        &self,
        actor: &AgentActor,
        input: &SendAgentMessage,
    ) -> AgentResult<()> {
        if self.config.model_provider != Some(ModelProvider::Perplexity)
            || input.context.media_ids.is_empty()
        {
            return Ok(());
        }
        let conversation = self
            .store
            .get_conversation(actor, &input.conversation_id)
            .await?;
        for id in input.context.media_ids.iter().take(5) {
            let media = crate::service::db::schema::tables::notebook::images::find_notebook_image(
                self.store.pool(),
                id,
                &actor.user_id,
            )
            .await
            .map_err(|error| {
                log::error!("agent media preflight failed: {error:#}");
                AgentError::Internal
            })?
            .filter(|media| media.workspace_id == conversation.workspace_id)
            .ok_or(AgentError::NotFound)?;
            if media.media_type == "video" {
                return Err(AgentError::Validation(
                    "Perplexity does not support video attachments".into(),
                ));
            }
        }
        Ok(())
    }

    pub async fn get_run(&self, actor: &AgentActor, run_id: &str) -> AgentResult<AgentRun> {
        self.ensure_enabled()?;
        self.store.get_run(actor, run_id).await
    }

    pub async fn cancel_run(&self, actor: &AgentActor, run_id: &str) -> AgentResult<bool> {
        self.ensure_enabled()?;
        let changed = self.store.request_cancel(actor, run_id).await?;
        self.wake.notify_waiters();
        Ok(changed)
    }

    pub async fn replay_events(
        &self,
        actor: &AgentActor,
        run_id: &str,
        after_sequence: i64,
    ) -> AgentResult<Vec<AgentRunEvent>> {
        self.ensure_enabled()?;
        self.store.events_after(actor, run_id, after_sequence).await
    }

    pub async fn message_activity(
        &self,
        actor: &AgentActor,
        message_id: &str,
    ) -> AgentResult<Option<super::AgentMessageActivity>> {
        self.ensure_enabled()?;
        self.store.activity_for_message(actor, message_id).await
    }

    pub async fn message_activity_summaries(
        &self,
        actor: &AgentActor,
        message_ids: &[String],
    ) -> AgentResult<Vec<super::AgentActivitySummary>> {
        self.ensure_enabled()?;
        self.store.activity_summaries(actor, message_ids).await
    }

    pub async fn replay_activity(
        &self,
        actor: &AgentActor,
        run_id: &str,
        after_sequence: i64,
    ) -> AgentResult<Vec<super::AgentActivityEntry>> {
        self.ensure_enabled()?;
        Ok(self
            .store
            .events_after(actor, run_id, after_sequence)
            .await?
            .iter()
            .filter_map(super::project_event)
            .collect())
    }

    pub async fn list_memories(
        &self,
        actor: &AgentActor,
        workspace_id: Option<&str>,
        include_inactive: bool,
    ) -> AgentResult<Vec<super::AgentMemoryRecord>> {
        self.ensure_enabled()?;
        self.store
            .list_memories(actor, workspace_id, include_inactive, 200)
            .await
    }

    pub async fn update_memory(
        &self,
        actor: &AgentActor,
        id: &str,
        text: &str,
    ) -> AgentResult<super::AgentMemoryRecord> {
        self.ensure_enabled()?;
        self.store.update_memory_text(actor, id, text).await
    }

    pub async fn set_memory_pinned(
        &self,
        actor: &AgentActor,
        id: &str,
        pinned: bool,
    ) -> AgentResult<super::AgentMemoryRecord> {
        self.ensure_enabled()?;
        self.store.set_memory_pinned(actor, id, pinned).await
    }

    pub async fn forget_memory(&self, actor: &AgentActor, id: &str) -> AgentResult<bool> {
        self.ensure_enabled()?;
        self.store.forget_memory(actor, id).await
    }

    pub async fn propose_action(
        &self,
        actor: &AgentActor,
        run_id: &str,
        payload: super::AgentActionPayload,
    ) -> AgentResult<super::AgentActionProposal> {
        self.ensure_enabled()?;
        let run = self.store.get_run(actor, run_id).await?;
        let payload = super::actions::validation::hydrate_expected_versions(
            self.store.pool(),
            actor,
            &run.workspace_id,
            payload,
        )
        .await?;
        let (payload, preview) = super::actions::validation::validate_and_preview(
            self.store.pool(),
            actor,
            &run.workspace_id,
            payload,
        )
        .await?;
        self.store
            .create_action_proposal(actor, run_id, &payload, &preview, 15)
            .await
    }

    pub async fn get_action_proposal(
        &self,
        actor: &AgentActor,
        proposal_id: &str,
    ) -> AgentResult<super::AgentActionProposal> {
        self.ensure_enabled()?;
        self.store.get_action_proposal(actor, proposal_id).await
    }

    pub async fn approve_action(
        &self,
        actor: &AgentActor,
        proposal_id: &str,
        idempotency_key: &str,
    ) -> AgentResult<super::AgentActionProposal> {
        self.ensure_enabled()?;
        let proposal = self
            .store
            .approve_action_proposal(actor, proposal_id, idempotency_key)
            .await?;
        self.wake.notify_waiters();
        Ok(proposal)
    }

    pub async fn reject_action(
        &self,
        actor: &AgentActor,
        proposal_id: &str,
    ) -> AgentResult<super::AgentActionProposal> {
        self.ensure_enabled()?;
        self.store.reject_action_proposal(actor, proposal_id).await
    }

    pub async fn notebook_autocomplete(
        &self,
        actor: &AgentActor,
        title: &str,
        text: &str,
    ) -> AgentResult<String> {
        self.ensure_enabled()?;
        super::assistance::complete(self, actor, title, text).await
    }

    pub async fn notebook_rewrite(
        &self,
        actor: &AgentActor,
        action: super::assistance::RewriteAction,
        text: &str,
    ) -> AgentResult<String> {
        self.ensure_enabled()?;
        super::assistance::rewrite(self, actor, action, text).await
    }

    pub async fn synthesize_market_report(
        &self,
        actor: &AgentActor,
        prompt: &str,
    ) -> AgentResult<String> {
        self.ensure_enabled()?;
        super::assistance::synthesize_market_report(self, actor, prompt).await
    }
}

fn validate_context_references(context: &AgentMessageContext) -> AgentResult<()> {
    if context.references.len() > MAX_CONTEXT_REFERENCES {
        return Err(AgentError::Validation(format!(
            "message context cannot contain more than {MAX_CONTEXT_REFERENCES} references"
        )));
    }
    let mut keys = HashSet::new();
    for reference in &context.references {
        let valid_text = !reference.key.trim().is_empty()
            && reference.key.chars().count() <= 180
            && !reference.title.trim().is_empty()
            && reference.title.chars().count() <= 120
            && reference.subtitle.chars().count() <= 240;
        let valid_target = match reference.kind {
            AgentContextKind::Trade => reference
                .id
                .as_ref()
                .is_some_and(|id| context.trade_ids.contains(id)),
            AgentContextKind::Playbook => reference
                .id
                .as_ref()
                .is_some_and(|id| context.playbook_ids.contains(id)),
            AgentContextKind::Note => reference
                .id
                .as_ref()
                .is_some_and(|id| context.note_ids.contains(id)),
            AgentContextKind::Media => reference
                .id
                .as_ref()
                .is_some_and(|id| context.media_ids.contains(id)),
            AgentContextKind::Market => {
                reference.id.is_none()
                    && context
                        .market_symbol
                        .as_deref()
                        .is_some_and(|symbol| symbol.eq_ignore_ascii_case(&reference.title))
            }
            AgentContextKind::DateRange => reference.id.is_none() && context.date_range.is_some(),
        };
        if !valid_text || !valid_target || !keys.insert(reference.key.as_str()) {
            return Err(AgentError::Validation(
                "message context contains an invalid reference".into(),
            ));
        }
    }
    Ok(())
}
