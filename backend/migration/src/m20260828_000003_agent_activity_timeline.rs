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
                ALTER TABLE agent_runs
                    ADD COLUMN IF NOT EXISTS output_message_id text;

                WITH candidates AS (
                    SELECT DISTINCT ON (message.id)
                           run.id AS run_id,
                           message.id AS message_id
                    FROM agent_runs run
                    JOIN agent_run_events event
                      ON event.run_id = run.id
                     AND event.kind = 'run_completed'
                    JOIN agent_messages message
                      ON message.id = event.payload_json->>'messageId'
                     AND message.conversation_id = run.conversation_id
                     AND message.user_id = run.user_id
                     AND message.workspace_id = run.workspace_id
                     AND message.role = 'assistant'
                    WHERE run.parent_run_id IS NULL
                      AND run.status = 'completed'
                      AND run.output_message_id IS NULL
                    ORDER BY message.id, run.completed_at DESC NULLS LAST, event.sequence DESC
                )
                UPDATE agent_runs run
                SET output_message_id = candidates.message_id
                FROM candidates
                WHERE run.id = candidates.run_id;

                DO $migration$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_runs'::regclass
                          AND contype = 'f'
                          AND pg_get_constraintdef(oid, true) =
                              'FOREIGN KEY (output_message_id) REFERENCES agent_messages(id) ON DELETE CASCADE'
                    ) THEN
                        ALTER TABLE agent_runs
                            ADD CONSTRAINT agent_runs_output_message_id_fkey
                            FOREIGN KEY (output_message_id)
                            REFERENCES agent_messages(id) ON DELETE CASCADE;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'agent_runs'::regclass
                          AND conname = 'agent_runs_output_message_root_check'
                    ) THEN
                        ALTER TABLE agent_runs
                            ADD CONSTRAINT agent_runs_output_message_root_check
                            CHECK (parent_run_id IS NULL OR output_message_id IS NULL);
                    END IF;
                END
                $migration$;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_output_message
                    ON agent_runs (output_message_id)
                    WHERE output_message_id IS NOT NULL;
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
