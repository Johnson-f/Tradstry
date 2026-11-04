//! Each environment lives in its own Postgres schema: `dev` and `prod` get
//! their own tables, migration history and change notifications, even in one
//! database, and nothing lands in `public`.

use sqlx::{PgPool, postgres::PgListener};
use tradstry::{db, realtime};

async fn tables(pool: &PgPool, schema: &str) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1",
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = false)]
async fn dev_and_prod_get_their_own_tables_and_channels(pool: PgPool) {
    let options = pool.connect_options().as_ref().clone();
    let dev = db::connect_with(options.clone(), "dev").await.unwrap();
    let prod = db::connect_with(options, "prod").await.unwrap();

    let dev_tables = tables(&pool, "dev").await;
    assert!(
        dev_tables.contains(&"trades".to_owned())
            && dev_tables.contains(&"_sqlx_migrations".to_owned())
    );
    assert_eq!(
        dev_tables,
        tables(&pool, "prod").await,
        "both schemas are fully migrated"
    );
    assert!(
        tables(&pool, "public").await.is_empty(),
        "nothing is created in public"
    );

    let mut dev_events = PgListener::connect_with(&pool).await.unwrap();
    dev_events.listen(&realtime::channel("dev")).await.unwrap();
    sqlx::query("INSERT INTO users (id, stytch_user_id) VALUES ($1, 'user-dev')")
        .bind(db::new_id())
        .execute(&dev)
        .await
        .unwrap();
    let user: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users")
        .fetch_one(&dev)
        .await
        .unwrap();
    sqlx::query("INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, 'Dev')")
        .bind(db::new_id())
        .bind(user)
        .execute(&dev)
        .await
        .unwrap();
    let notification = tokio::time::timeout(std::time::Duration::from_secs(5), dev_events.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(
        notification.payload().contains("\"workspaces\""),
        "{}",
        notification.payload()
    );

    let in_prod: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&prod)
        .await
        .unwrap();
    assert_eq!(in_prod, 0, "dev's rows are not visible from prod");
}
