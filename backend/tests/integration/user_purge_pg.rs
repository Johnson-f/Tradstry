use crate::pg_support::TestDb;
use sea_orm::SqlxPostgresConnector;
use tradstry_backend::service::users::purge::{collect_r2_keys, delete_user_by_clerk_uuid};

/// Returns `(user_id, clerk_uuid, r2_key)`.
async fn seed_user_with_image(pool: &sqlx::PgPool) -> (String, String, String) {
    let user_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();
    let blob_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let key = format!("notebook/{user_id}/media/deadbeef");

    sqlx::query("INSERT INTO users (id, clerk_uuid, email, full_name) VALUES ($1, $2, $3, $4)")
        .bind(&user_id)
        .bind(&clerk_uuid)
        .bind(format!("{user_id}@test.local"))
        .bind("Test User")
        .execute(pool)
        .await
        .expect("seed user");

    sqlx::query(
        "INSERT INTO notebook_media_blobs
         (id,user_id,content_hash,object_key,state,content_type,media_type,format,bytes,
          checksum_sha256,quota_counted)
         VALUES ($1,$2,'deadbeef',$3,'ready','image/png','image','png',10,'deadbeef',true)",
    )
    .bind(&blob_id)
    .bind(&user_id)
    .bind(&key)
    .execute(pool)
    .await
    .expect("seed image");

    (user_id, clerk_uuid, key)
}

#[tokio::test(flavor = "multi_thread")]
async fn collects_every_r2_key_for_the_user() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();

    let (user_id, _clerk_uuid, key) = seed_user_with_image(&pool).await;

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let keys = collect_r2_keys(&db, &user_id).await.expect("collect keys");

    assert_eq!(keys, vec![key]);
}

#[tokio::test(flavor = "multi_thread")]
async fn deletes_the_user_and_returns_the_internal_id() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();

    let (user_id, clerk_uuid, _key) = seed_user_with_image(&pool).await;

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let deleted = delete_user_by_clerk_uuid(&db, &clerk_uuid)
        .await
        .expect("delete user");

    assert_eq!(deleted.as_deref(), Some(user_id.as_str()));

    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_blobs WHERE user_id = $1")
            .bind(&user_id)
            .fetch_one(&pool)
            .await
            .expect("count images");
    assert_eq!(remaining, 0, "notebook media should cascade away");
}

#[tokio::test(flavor = "multi_thread")]
async fn returns_none_for_an_unknown_clerk_uuid() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let deleted = delete_user_by_clerk_uuid(&db, "user_does_not_exist")
        .await
        .expect("delete user");

    assert!(deleted.is_none());
}
