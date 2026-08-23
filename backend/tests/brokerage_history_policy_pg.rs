mod pg_support;

use chrono::NaiveDate;
use pg_support::{reset_schema, seed_user_workspace, test_pool};
use tradstry_backend::service::brokerage::{
    client::SnapTradeAccount,
    history_policy::{self, TransactionImportMode},
    workspaces::{self, AccountImportSelection},
};
use tradstry_backend::service::db::schema::tables::workspaces_table;

fn account(id: &str, name: &str) -> SnapTradeAccount {
    SnapTradeAccount {
        id: Some(id.to_string()),
        brokerage_authorization: Some("connection-1".to_string()),
        name: Some(name.to_string()),
        number: None,
        institution_name: Some("Webull".to_string()),
        sync_status: None,
    }
}

#[tokio::test]
async fn prepared_connection_waits_for_an_explicit_policy() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;

    let prepared = workspaces_table::prepare_snaptrade_connection(
        &pool,
        &workspace_id,
        &user_id,
        "snaptrade-user",
        "encrypted-secret",
        "connection-1",
    )
    .await
    .unwrap();
    assert!(!prepared.brokerage_setup_complete);
    assert!(prepared.snaptrade_account_id.is_none());

    workspaces_table::set_snaptrade_account_id(&pool, &workspace_id, &user_id, "cash")
        .await
        .unwrap();
    let stored = workspaces_table::find_workspace(&pool, &workspace_id, &user_id)
        .await
        .unwrap()
        .unwrap();
    assert!(stored.brokerage_setup_complete);
    let policy = history_policy::get(&pool, &user_id, &workspace_id, "cash")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(policy.mode, TransactionImportMode::All);
    assert!(policy.start_date.is_none());
}

#[tokio::test]
async fn multi_account_finalization_persists_independent_fixed_boundaries() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    workspaces_table::prepare_snaptrade_connection(
        &pool,
        &workspace_id,
        &user_id,
        "snaptrade-user",
        "encrypted-secret",
        "connection-1",
    )
    .await
    .unwrap();

    let today = NaiveDate::from_ymd_opt(2026, 8, 22).unwrap();
    let cash_policy = history_policy::resolve(TransactionImportMode::OneYear, None, today).unwrap();
    let margin_policy = history_policy::resolve(TransactionImportMode::All, None, today).unwrap();
    let accounts = vec![
        account("cash", "Webull Individual Cash"),
        account("margin", "Webull Individual Margin"),
    ];
    let configured = workspaces::finalize_connection_accounts(
        &pool,
        &user_id,
        &workspace_id,
        &accounts,
        "cash",
        &[
            AccountImportSelection {
                snaptrade_account_id: "cash",
                policy: cash_policy,
            },
            AccountImportSelection {
                snaptrade_account_id: "margin",
                policy: margin_policy,
            },
        ],
    )
    .await
    .unwrap();

    assert_eq!(configured.len(), 2);
    let source = configured
        .iter()
        .find(|workspace| workspace.id == workspace_id)
        .unwrap();
    assert_eq!(source.snaptrade_account_id.as_deref(), Some("cash"));
    assert!(source.brokerage_setup_complete);
    let margin = configured
        .iter()
        .find(|workspace| workspace.snaptrade_account_id.as_deref() == Some("margin"))
        .unwrap();
    assert_ne!(margin.id, workspace_id);

    let cash = history_policy::get(&pool, &user_id, &workspace_id, "cash")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cash.start_date.as_deref(), Some("2025-08-22"));
    let margin_policy = history_policy::get(&pool, &user_id, &margin.id, "margin")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(margin_policy.mode, TransactionImportMode::All);
    assert!(margin_policy.start_date.is_none());
}
