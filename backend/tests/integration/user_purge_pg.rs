use crate::pg_support::TestDb;
use sea_orm::SqlxPostgresConnector;
use tradstry_backend::service::users::purge::collect_r2_keys;

/// Returns `(user_id, r2_key)`.
async fn seed_user_with_image(pool: &sqlx::PgPool) -> (String, String) {
    let user_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let stytch_user_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let blob_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let key = format!("notebook/{user_id}/media/deadbeef");

    sqlx::query("INSERT INTO users (id, stytch_user_id, email, full_name) VALUES ($1, $2, $3, $4)")
        .bind(&user_id)
        .bind(&stytch_user_id)
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

    (user_id, key)
}

#[tokio::test(flavor = "multi_thread")]
async fn collects_every_r2_key_for_the_user() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();

    let (user_id, key) = seed_user_with_image(&pool).await;

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let keys = collect_r2_keys(&db, &user_id).await.expect("collect keys");

    assert_eq!(keys, vec![key]);
}
