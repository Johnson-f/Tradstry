use std::sync::Arc;

use serde_json::json;
use tokio::sync::Notify;

use super::knowledge::KnowledgeService;
use super::runtime::AgentModelRegistry;
use super::{
    AgentActor, AgentBudget, AgentCapabilities, AgentConfig, AgentConversation, AgentError,
    AgentLane, AgentMessage, AgentResult, AgentRun, AgentRunEvent, AgentRunHandle, AgentScope,
    AgentStore, SendAgentMessage,
};

const MAX_MESSAGE_CHARS: usize = 32_000;

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

    pub fn from_env(db: &crate::service::db::Db) -> AgentResult<Self> {
        let config = AgentConfig::from_env()?;
        let models = if config.enabled {
            Some(AgentModelRegistry::from_config(&config)?)
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
            lanes: vec![AgentLane::Instant, AgentLane::FastAi, AgentLane::Deep],
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
        let enqueued = self
            .store
            .enqueue_message_run(
                actor,
                &input.conversation_id,
                &json!({ "text": content, "context": input.context }),
                AgentLane::Deep,
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
