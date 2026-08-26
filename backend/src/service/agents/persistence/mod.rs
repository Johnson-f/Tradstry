mod actions;
mod answers;
mod checkpoints;
mod conversations;
mod events;
mod evidence;
mod memories;
mod queue;
mod runs;
mod summaries;
mod tool_calls;

use sqlx::PgPool;

#[derive(Clone)]
pub struct AgentStore {
    pool: PgPool,
}

impl AgentStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

pub use answers::CompletedAgentAnswer;
pub use checkpoints::AgentCheckpoint;
pub use evidence::{AgentEvidence, NewAgentEvidence};
pub use memories::{ActivateAgentMemory, normalized_hash};
pub use queue::EnqueuedAgentRun;
pub use runs::CreateAgentRun;
pub use summaries::ConversationSummaryJob;
pub use tool_calls::AgentToolCall;
