use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "UPDATE notebook_media_outbox
                 SET attempt_count=0,available_at=now(),lease_owner=NULL,leased_at=NULL,
                     last_error_code=NULL
                 WHERE action='derive' AND completed_at IS NULL
                   AND attempt_count>=max_attempts AND last_error_code='media_worker_failed'",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
