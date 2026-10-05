pub use sea_orm_migration::prelude::*;

mod m20260826_000001_adopt_postgres_support;
mod m20260827_000002_replace_agent_runtime;
mod m20260828_000003_agent_activity_timeline;
mod m20260830_000004_notebook_media_lifecycle;
mod m20260830_000005_remove_notebook_images;
mod m20260830_000006_requeue_media_derivatives;
mod m20260902_000007_uuid_v7_defaults;
mod m20261003_000008_journal_first_flow;
mod m20261005_000009_recent_trade_notes;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260826_000001_adopt_postgres_support::Migration),
            Box::new(m20260827_000002_replace_agent_runtime::Migration),
            Box::new(m20260828_000003_agent_activity_timeline::Migration),
            Box::new(m20260830_000004_notebook_media_lifecycle::Migration),
            Box::new(m20260830_000005_remove_notebook_images::Migration),
            Box::new(m20260830_000006_requeue_media_derivatives::Migration),
            Box::new(m20260902_000007_uuid_v7_defaults::Migration),
            Box::new(m20261003_000008_journal_first_flow::Migration),
            Box::new(m20261005_000009_recent_trade_notes::Migration),
        ]
    }
}
