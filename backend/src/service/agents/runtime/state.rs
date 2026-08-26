use std::sync::Arc;

use tinyagents::CancellationToken;

use crate::service::agents::knowledge::KnowledgeService;
use crate::service::agents::{AgentActor, AgentMessageContext, AgentScope, AgentStore};
use crate::service::db::Db;
use crate::service::r2::R2Client;

#[derive(Clone)]
pub struct AgentRuntimeState {
    pub db: Arc<Db>,
    pub store: AgentStore,
    pub r2: Option<Arc<R2Client>>,
    pub knowledge: Option<Arc<KnowledgeService>>,
    pub actor: AgentActor,
    pub scope: AgentScope,
    pub message_context: AgentMessageContext,
    pub run_id: String,
    pub cancellation: CancellationToken,
}
