use std::time::Duration;

use crate::pg_support::{TestDb, seed_user_workspace};
use tokio::time::timeout;
use tradstry_backend::service::brokerage::connection::{UpstreamConnection, connection_to_release};
use tradstry_backend::service::db::schema::tables::workspaces_table;
use tradstry_backend::service::db::schema::tables::workspaces_table::{
    CreateWorkspaceInput, UpdateWorkspaceInput,
};

async fn seed_two_workspaces(pool: &sqlx::PgPool) -> (String, String, String) {
    let (user_id, first_workspace_id) = seed_user_workspace(pool).await;
    let second = workspaces_table::create_workspace(
        pool,
        &user_id,
        CreateWorkspaceInput {
            name: "Second Workspace".into(),
            icon: "chart-line-data-01".into(),
            currency: "USD".into(),
            asset_class: "mixed".into(),
            broker: None,
            risk_profile: "moderate".into(),
        },
    )
    .await
    .expect("create second workspace");

    (user_id, first_workspace_id, second.id)
}

#[tokio::test(flavor = "multi_thread")]
async fn deletion_takes_the_per_user_lock() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, first_workspace_id, _) = seed_two_workspaces(&pool).await;

    let mut blocker = pool.begin().await.expect("begin blocker transaction");
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(&user_id)
        .execute(&mut *blocker)
        .await
        .expect("lock user");

    let delete_pool = pool.clone();
    let delete_user_id = user_id.clone();
    let mut deletion = tokio::spawn(async move {
        workspaces_table::delete_workspace(&delete_pool, &first_workspace_id, &delete_user_id).await
    });

    assert!(
        timeout(Duration::from_millis(100), &mut deletion)
            .await
            .is_err(),
        "deletion must wait while another transaction holds the user's lock"
    );

    blocker.rollback().await.expect("release user lock");
    assert!(deletion.await.expect("deletion task").expect("delete"));
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_deletions_always_leave_one_workspace() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, first_workspace_id, second_workspace_id) = seed_two_workspaces(&pool).await;

    let first = workspaces_table::delete_workspace(&pool, &first_workspace_id, &user_id);
    let second = workspaces_table::delete_workspace(&pool, &second_workspace_id, &user_id);
    let (first_result, second_result) = tokio::join!(first, second);

    assert_eq!(
        usize::from(first_result.is_ok()) + usize::from(second_result.is_ok()),
        1,
        "exactly one deletion should succeed"
    );
    assert_eq!(
        workspaces_table::list_workspaces(&pool, &user_id)
            .await
            .expect("list remaining workspaces")
            .len(),
        1,
        "the final workspace must be preserved"
    );
}

fn input(currency: &str, risk_profile: &str) -> CreateWorkspaceInput {
    CreateWorkspaceInput {
        name: "Crypto".into(),
        icon: "chart-line-data-01".into(),
        currency: currency.into(),
        asset_class: "crypto".into(),
        broker: None,
        risk_profile: risk_profile.into(),
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn workspaces_only_take_the_currencies_and_risk_profiles_the_app_offers() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;

    for (currency, risk) in [("BTC", "moderate"), ("USD", "yolo")] {
        assert!(
            workspaces_table::create_workspace(&pool, &user_id, input(currency, risk))
                .await
                .is_err(),
            "created a workspace with {currency}/{risk}"
        );
    }
    for update in [
        UpdateWorkspaceInput {
            currency: Some("BTC".into()),
            ..no_changes()
        },
        UpdateWorkspaceInput {
            risk_profile: Some("yolo".into()),
            ..no_changes()
        },
    ] {
        assert!(
            workspaces_table::update_workspace(&pool, &workspace_id, &user_id, update)
                .await
                .is_err()
        );
    }

    let workspaces = workspaces_table::list_workspaces(&pool, &user_id)
        .await
        .expect("list workspaces");
    assert_eq!(workspaces.len(), 1);
    assert!(
        ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"]
            .contains(&workspaces[0].currency.as_str())
    );
}

fn no_changes() -> UpdateWorkspaceInput {
    UpdateWorkspaceInput {
        name: None,
        icon: None,
        currency: None,
        asset_class: None,
        broker: None,
        risk_profile: None,
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn a_failed_brokerage_release_keeps_the_workspace() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, first_workspace_id, _) = seed_two_workspaces(&pool).await;

    let result =
        workspaces_table::delete_workspace_with(&pool, &first_workspace_id, &user_id, async |_| {
            Err(anyhow::anyhow!("SnapTrade is down"))
        })
        .await;

    assert!(result.is_err());
    assert!(
        workspaces_table::find_workspace(&pool, &first_workspace_id, &user_id)
            .await
            .expect("find workspace")
            .is_some(),
        "the workspace must survive a failed release"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn the_brokerage_is_only_released_for_a_deletion_that_happens() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, only_workspace_id) = seed_user_workspace(&pool).await;
    let released = std::sync::atomic::AtomicUsize::new(0);
    let release = async |_: &workspaces_table::Workspace| {
        released.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    };

    assert!(
        workspaces_table::delete_workspace_with(&pool, &only_workspace_id, &user_id, release)
            .await
            .is_err(),
        "the last workspace must not be deleted"
    );
    let (user_id, _, _) = seed_two_workspaces(&pool).await;
    assert!(
        !workspaces_table::delete_workspace_with(&pool, "no-such-workspace", &user_id, release)
            .await
            .expect("delete unknown workspace")
    );
    assert_eq!(released.load(std::sync::atomic::Ordering::SeqCst), 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_connection_is_only_released_when_no_other_workspace_uses_it() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user_id, first_workspace_id, second_workspace_id) = seed_two_workspaces(&pool).await;
    let connect = async |workspace_id: &str, connection_id: &str| {
        workspaces_table::update_snaptrade_credentials(
            &pool,
            workspace_id,
            &user_id,
            "snaptrade-user",
            "encrypted-secret",
            Some(connection_id),
        )
        .await
        .expect("store SnapTrade credentials")
    };

    let unconnected = workspaces_table::find_workspace(&pool, &first_workspace_id, &user_id)
        .await
        .expect("find workspace")
        .expect("workspace exists");
    assert_eq!(
        connection_to_release(&pool, &user_id, &unconnected)
            .await
            .expect("check release"),
        None
    );

    let first = connect(&first_workspace_id, "connection-1").await;
    assert_eq!(
        connection_to_release(&pool, &user_id, &first)
            .await
            .expect("check release"),
        Some(UpstreamConnection {
            snaptrade_user_id: "snaptrade-user",
            user_secret_encrypted: "encrypted-secret",
            connection_id: "connection-1",
        })
    );

    connect(&second_workspace_id, "connection-1").await;
    assert_eq!(
        connection_to_release(&pool, &user_id, &first)
            .await
            .expect("check release"),
        None,
        "a connection another workspace still uses must stay connected"
    );
}
