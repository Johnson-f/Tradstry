use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE TABLE IF NOT EXISTS agent_run_items (
                    id text PRIMARY KEY,
                    run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
                    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    sequence bigint NOT NULL,
                    item_key text NOT NULL,
                    kind text NOT NULL,
                    message_json jsonb NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    CONSTRAINT agent_run_items_run_id_sequence_key UNIQUE (run_id, sequence),
                    CONSTRAINT agent_run_items_kind_check CHECK (kind = ANY (ARRAY['assistant'::text, 'tool'::text]))
                );
                CREATE INDEX IF NOT EXISTS idx_agent_run_items_run_sequence
                    ON agent_run_items (run_id, sequence);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_items_run_item_key
                    ON agent_run_items (run_id, item_key);
                ALTER TABLE agent_run_items ALTER COLUMN created_at SET DEFAULT now();
                DO $migration$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_run_items'::regclass
                          AND conname = 'agent_run_items_run_id_sequence_key'
                    ) THEN
                        ALTER TABLE agent_run_items
                            ADD CONSTRAINT agent_run_items_run_id_sequence_key
                            UNIQUE (run_id, sequence);
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_run_items'::regclass
                          AND conname = 'agent_run_items_kind_check'
                    ) THEN
                        ALTER TABLE agent_run_items
                            ADD CONSTRAINT agent_run_items_kind_check
                            CHECK (kind = ANY (ARRAY['assistant'::text, 'tool'::text]));
                    END IF;
                END
                $migration$;

                ALTER TABLE agent_action_proposals
                    ADD COLUMN IF NOT EXISTS tool_call_id text;
                DO $migration$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_action_proposals'::regclass
                          AND contype = 'f'
                          AND pg_get_constraintdef(oid, true) =
                              'FOREIGN KEY (tool_call_id) REFERENCES agent_tool_calls(id) ON DELETE SET NULL'
                    ) THEN
                        ALTER TABLE agent_action_proposals
                            ADD CONSTRAINT agent_action_proposals_tool_call_id_fkey
                            FOREIGN KEY (tool_call_id) REFERENCES agent_tool_calls(id) ON DELETE SET NULL;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_action_proposals'::regclass
                          AND conname = 'agent_action_proposals_run_id_tool_call_id_key'
                    ) THEN
                        ALTER TABLE agent_action_proposals
                            ADD CONSTRAINT agent_action_proposals_run_id_tool_call_id_key
                            UNIQUE (run_id, tool_call_id);
                    END IF;
                END
                $migration$;

                ALTER TABLE agent_evidence
                    ADD COLUMN IF NOT EXISTS idempotency_key text;
                DO $migration$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_evidence'::regclass
                          AND conname = 'agent_evidence_run_id_idempotency_key_key'
                    ) THEN
                        ALTER TABLE agent_evidence
                            ADD CONSTRAINT agent_evidence_run_id_idempotency_key_key
                            UNIQUE (run_id, idempotency_key);
                    END IF;
                END
                $migration$;

                INSERT INTO agent_run_events
                    (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
                SELECT gen_random_uuid()::text, id, user_id, workspace_id,
                       next_event_sequence, 'run_failed',
                       '{"errorCode":"runtime_replaced"}'::jsonb
                FROM agent_runs
                WHERE status IN ('queued', 'running', 'waiting_for_approval');

                UPDATE agent_runs
                SET status = 'failed', error_code = 'runtime_replaced',
                    completed_at = now(), updated_at = now(),
                    next_event_sequence = next_event_sequence + 1
                WHERE status IN ('queued', 'running', 'waiting_for_approval');

                DROP TABLE IF EXISTS agent_checkpoints CASCADE;
                ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_lane_check;
                ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
                ALTER TABLE agent_runs DROP COLUMN IF EXISTS lane;
                ALTER TABLE agent_runs DROP COLUMN IF EXISTS stage;
                ALTER TABLE agent_runs
                    ADD CONSTRAINT agent_runs_status_check
                    CHECK (status = ANY (ARRAY[
                        'queued'::text, 'running'::text, 'completed'::text,
                        'failed'::text, 'cancelled'::text
                    ]));
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
