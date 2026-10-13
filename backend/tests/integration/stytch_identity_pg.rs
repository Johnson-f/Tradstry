use sea_orm::SqlxPostgresConnector;
use tradstry_backend::service::auth::Subject;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::db::schema::tables::users_table;
use tradstry_backend::service::read_service::users::{AccountRequired, Provisioning, load_user};

use crate::pg_support::TestDb;

fn stytch(user_id: &str, clerk_id: Option<&str>) -> Subject {
    Subject::Stytch {
        user_id: user_id.to_owned(),
        clerk_id: clerk_id.map(str::to_owned),
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn a_new_stytch_user_gets_an_account_without_a_clerk_id() {
    let test_db = TestDb::new().await;
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(test_db.pool());
    let subject = stytch("user-test-new", None);

    let (user, created) = users_table::find_or_create_user(&db, &subject, "Ada", "ada@x.com")
        .await
        .unwrap();
    assert!(created);
    assert_eq!(user.stytch_user_id.as_deref(), Some("user-test-new"));
    assert_eq!(user.clerk_uuid, None);

    let (again, created) = users_table::find_or_create_user(&db, &subject, "Ada", "ada@x.com")
        .await
        .unwrap();
    assert!(!created);
    assert_eq!(again.id, user.id);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_first_stytch_login_links_the_imported_clerk_account_once() {
    let test_db = TestDb::new().await;
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(test_db.pool());
    let (clerk_user, _) = users_table::find_or_create_user(
        &db,
        &Subject::Clerk("user_clerk".into()),
        "Ada",
        "ada@x.com",
    )
    .await
    .unwrap();

    let (linked, created) =
        users_table::find_or_create_user(&db, &stytch("user-test-1", Some("user_clerk")), "", "")
            .await
            .unwrap();
    assert!(!created);
    assert_eq!(linked.id, clerk_user.id);
    assert_eq!(linked.stytch_user_id.as_deref(), Some("user-test-1"));
    assert_eq!(linked.clerk_uuid.as_deref(), Some("user_clerk"));

    let by_stytch = users_table::find_user(&db, &stytch("user-test-1", None))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(by_stytch.id, clerk_user.id);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_clerk_account_already_linked_to_another_stytch_user_is_not_taken_over() {
    let test_db = TestDb::new().await;
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(test_db.pool());
    let (clerk_user, _) =
        users_table::find_or_create_user(&db, &Subject::Clerk("user_clerk".into()), "", "")
            .await
            .unwrap();
    users_table::find_user(&db, &stytch("user-test-owner", Some("user_clerk")))
        .await
        .unwrap()
        .unwrap();

    let intruder = stytch("user-test-other", Some("user_clerk"));
    assert!(
        users_table::find_user(&db, &intruder)
            .await
            .unwrap()
            .is_none()
    );

    let (created_user, created) = users_table::find_or_create_user(&db, &intruder, "", "")
        .await
        .unwrap();
    assert!(created);
    assert_ne!(created_user.id, clerk_user.id);
}

#[tokio::test(flavor = "multi_thread")]
async fn connected_apps_only_reach_existing_stytch_accounts() {
    let test_db = TestDb::new().await;
    let db = Db::from_pool(test_db.pool());
    let subject = stytch("user-test-mcp", None);

    let err = load_user(&db, &subject, "", "", Provisioning::ExistingOnly)
        .await
        .unwrap_err();
    assert!(err.is::<AccountRequired>());

    let signed_up = load_user(
        &db,
        &subject,
        "Ada",
        "ada@x.com",
        Provisioning::CreateIfMissing,
    )
    .await
    .unwrap();
    let again = load_user(&db, &subject, "", "", Provisioning::ExistingOnly)
        .await
        .unwrap();
    assert_eq!(again.id, signed_up.id);
}
