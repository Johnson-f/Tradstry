use crate::pg_support::TestDb;
use tradstry_backend::service::db::schema::tables::notebook::images;

#[tokio::test(flavor = "multi_thread")]
async fn find_by_hash_returns_none_when_absent() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();

    let found = images::find_notebook_image_by_hash(&pool, "user-x", "deadbeef")
        .await
        .unwrap();
    assert!(found.is_none());
}
