use sea_orm::SqlxPostgresConnector;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::db::schema::tables::users_table;
use tradstry_backend::service::read_service::users::{AccountRequired, Provisioning, load_user};

use crate::pg_support::TestDb;

#[tokio::test(flavor = "multi_thread")]
async fn a_new_stytch_user_gets_an_account() {
    let test_db = TestDb::new().await;
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(test_db.pool());
    let subject = "user-test-new";

    let (user, created) = users_table::find_or_create_user(&db, subject, "Ada", "ada@x.com")
        .await
        .unwrap();
    assert!(created);
    assert_eq!(user.stytch_user_id.as_deref(), Some("user-test-new"));

    let (again, created) = users_table::find_or_create_user(&db, subject, "Ada", "ada@x.com")
        .await
        .unwrap();
    assert!(!created);
    assert_eq!(again.id, user.id);
}

#[tokio::test(flavor = "multi_thread")]
async fn connected_apps_only_reach_existing_stytch_accounts() {
    let test_db = TestDb::new().await;
    let db = Db::from_pool(test_db.pool());
    let subject = "user-test-mcp";

    let err = load_user(&db, subject, "", "", Provisioning::ExistingOnly)
        .await
        .unwrap_err();
    assert!(err.is::<AccountRequired>());

    let signed_up = load_user(
        &db,
        subject,
        "Ada",
        "ada@x.com",
        Provisioning::CreateIfMissing,
    )
    .await
    .unwrap();
    let again = load_user(&db, subject, "", "", Provisioning::ExistingOnly)
        .await
        .unwrap();
    assert_eq!(again.id, signed_up.id);
}
