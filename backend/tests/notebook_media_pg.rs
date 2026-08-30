mod pg_support;
use pg_support::{reset_schema, test_pool};
use sea_orm::SqlxPostgresConnector;
use sqlx::PgPool;
use tradstry_backend::service::db::schema::tables::notebook::images;
use tradstry_migration::{Migrator, MigratorTrait};

async fn migrate(pool: &PgPool) {
    tradstry_backend::service::db::schema::pg::migrate(pool)
        .await
        .expect("migrate");
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, None)
        .await
        .expect("apply SeaORM migrations");
}

#[tokio::test]
async fn find_by_hash_returns_none_when_absent() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    migrate(&pool).await;

    let found = images::find_notebook_image_by_hash(&pool, "user-x", "deadbeef")
        .await
        .unwrap();
    assert!(found.is_none());
}
