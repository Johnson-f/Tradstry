use crate::pg_support::{TestDb, seed_user_workspace};
use tradstry_backend::service::notifications::preferences;

#[tokio::test(flavor = "multi_thread")]
async fn a_user_with_no_rows_is_enabled() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    assert!(
        preferences::is_enabled(&pool, &user_id, "FillsLanded")
            .await
            .expect("is_enabled")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn an_explicit_false_disables_only_that_type() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    preferences::set(&pool, &user_id, "FillsLanded", false)
        .await
        .expect("set");

    assert!(
        !preferences::is_enabled(&pool, &user_id, "FillsLanded")
            .await
            .unwrap()
    );
    assert!(
        preferences::is_enabled(&pool, &user_id, "ArtifactReady")
            .await
            .unwrap(),
        "muting one type must not mute another"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_brand_new_event_type_reaches_a_user_who_muted_something_else() {
    // The regression this pins: switching to explicit opt-in would silently
    // stop delivering every event type added after a user's first mute.
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    preferences::set(&pool, &user_id, "FillsLanded", false)
        .await
        .expect("set");

    assert!(
        preferences::is_enabled(&pool, &user_id, "SomeFutureEventType")
            .await
            .unwrap()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn set_is_idempotent_and_can_re_enable() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    preferences::set(&pool, &user_id, "FillsLanded", false)
        .await
        .unwrap();
    preferences::set(&pool, &user_id, "FillsLanded", false)
        .await
        .unwrap();
    preferences::set(&pool, &user_id, "FillsLanded", true)
        .await
        .unwrap();

    assert!(
        preferences::is_enabled(&pool, &user_id, "FillsLanded")
            .await
            .unwrap()
    );
    let count: (i64,) = sqlx::query_as("SELECT count(*) FROM notification_preferences")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count.0, 1, "upsert, not insert");
}

#[tokio::test(flavor = "multi_thread")]
async fn list_returns_every_known_type() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    preferences::set(&pool, &user_id, "FillsLanded", false)
        .await
        .unwrap();

    let rows = preferences::list(&pool, &user_id).await.expect("list");
    assert_eq!(
        rows.len(),
        tradstry_backend::service::notifications::ALL_EVENT_TYPES.len()
    );
    let fills = rows.iter().find(|r| r.event_type == "FillsLanded").unwrap();
    assert!(!fills.enabled);
    let artifact = rows
        .iter()
        .find(|r| r.event_type == "ArtifactReady")
        .unwrap();
    assert!(artifact.enabled);
}
