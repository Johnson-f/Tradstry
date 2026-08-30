pub use sea_orm_migration::prelude::*;

mod m20260826_000001_adopt_postgres_support;
mod m20260827_000002_replace_agent_runtime;
mod m20260828_000003_agent_activity_timeline;
mod m20260830_000004_notebook_media_lifecycle;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260826_000001_adopt_postgres_support::Migration),
            Box::new(m20260827_000002_replace_agent_runtime::Migration),
            Box::new(m20260828_000003_agent_activity_timeline::Migration),
            Box::new(m20260830_000004_notebook_media_lifecycle::Migration),
        ]
    }
}
