use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "DO $migration$
                 BEGIN
                     IF to_regprocedure('uuidv7()') IS NULL THEN
                         RAISE EXCEPTION 'Tradstry requires PostgreSQL 18 with uuidv7() support';
                     END IF;
                 END
                 $migration$;
                 ALTER TABLE snaptrade_oauth_attempts
                     ALTER COLUMN id SET DEFAULT (uuidv7())::text;
                 ALTER TABLE snaptrade_oauth_grants
                     ALTER COLUMN id SET DEFAULT (uuidv7())::text;",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE snaptrade_oauth_attempts
                     ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
                 ALTER TABLE snaptrade_oauth_grants
                     ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;",
            )
            .await?;
        Ok(())
    }
}
