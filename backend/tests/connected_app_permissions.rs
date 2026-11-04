use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

use tradstry::{
    app::{self, AppState, Services},
    auth::test_jwt,
    brokerage::{Brokerage, history::ImportMode, linking::Selection, store},
    snaptrade::fake::{FakeAccount, FakeSnapTrade},
    users::{self, Provisioning},
};

fn app(pool: PgPool, brokerage: Option<Arc<Brokerage>>) -> Router {
    app::router(
        AppState::new(Services {
            verifier: test_jwt::connected_app_verifier(),
            brokerage,
            ..app::test_services(pool)
        }),
        vec![],
    )
}

async fn graphql(app: &Router, token: &str, query: &str, variables: Value) -> Value {
    let request = Request::post("/graphql")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "query": query, "variables": variables }).to_string(),
        ))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

fn data(response: Value) -> Value {
    assert!(response["errors"].is_null(), "{response}");
    response["data"].clone()
}

const CREATE: &str = "mutation { createWorkspace(name: \"Paper\") { id name } }";
const RENAME: &str =
    "mutation Rename($id: ID!) { renameWorkspace(id: $id, name: \"Renamed\") { id name } }";
const DELETE: &str = "mutation Delete($id: ID!) { deleteWorkspace(id: $id) }";
const WORKSPACES: &str = "{ workspaces { id name } }";

#[sqlx::test]
async fn connected_apps_cannot_change_workspaces_even_with_write_permission(pool: PgPool) {
    let app = app(pool, None);
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let created = data(graphql(&app, &website, CREATE, json!({})).await);
    let workspace = created["createWorkspace"]["id"].clone();
    for (side, price, at) in [
        ("BUY", "100", "2026-01-02T15:00:00Z"),
        ("SELL", "110", "2026-01-05T15:00:00Z"),
    ] {
        data(graphql(
            &app,
            &website,
            "mutation Add($w: ID!, $input: ManualFillInputObject!) { addManualFill(workspaceId: $w, input: $input) }",
            json!({ "w": workspace, "input": { "instrument": { "assetClass": "STOCK", "symbol": "AAPL" },
                "side": side, "quantity": "1", "price": price, "fee": "0", "executedAt": at } }),
        ).await);
    }
    let before = data(graphql(&app, &website, WORKSPACES, json!({})).await);
    for scope in ["openid", "tradstry:read", "tradstry:read tradstry:write"] {
        let token = test_jwt::connected_app_token("user-1", scope);
        for query in [CREATE, RENAME, DELETE] {
            let response = graphql(&app, &token, query, json!({ "id": workspace })).await;
            assert_eq!(
                response["errors"][0]["extensions"]["code"], "SESSION_REQUIRED",
                "scope={scope}, query={query}, response={response}"
            );
        }
    }
    assert_eq!(
        data(graphql(&app, &website, WORKSPACES, json!({})).await),
        before
    );
    let stats = data(
        graphql(
            &app,
            &website,
            "query Stats($w: ID!) { tradeStats(workspaceId: $w) { trades net } }",
            json!({ "w": workspace }),
        )
        .await,
    );
    assert_eq!(stats["tradeStats"], json!({ "trades": 1, "net": "10.00" }));
}

#[sqlx::test]
async fn website_workspace_changes_still_work_and_respect_ownership(pool: PgPool) {
    let app = app(pool, None);
    let owner = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let stranger = test_jwt::session_token("user-2", "other@example.com", "Other");
    let created = data(graphql(&app, &owner, CREATE, json!({})).await);
    let workspace = created["createWorkspace"]["id"].clone();

    for query in [RENAME, DELETE] {
        let response = graphql(&app, &stranger, query, json!({ "id": workspace })).await;
        assert_eq!(
            response["errors"][0]["extensions"]["code"], "NOT_FOUND",
            "{response}"
        );
    }
    let renamed = data(graphql(&app, &owner, RENAME, json!({ "id": workspace })).await);
    assert_eq!(renamed["renameWorkspace"]["name"], "Renamed");
    let deleted = data(graphql(&app, &owner, DELETE, json!({ "id": workspace })).await);
    assert_eq!(deleted["deleteWorkspace"], true);
    let remaining = data(graphql(&app, &owner, WORKSPACES, json!({})).await);
    assert_eq!(remaining["workspaces"].as_array().unwrap().len(), 1);
    let response = graphql(
        &app,
        &owner,
        DELETE,
        json!({ "id": remaining["workspaces"][0]["id"] }),
    )
    .await;
    assert_eq!(
        response["errors"][0]["extensions"]["code"],
        "LAST_WORKSPACE"
    );
}

#[sqlx::test]
async fn connected_apps_cannot_change_brokerage_state_even_through_queries(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Arc::new(Brokerage::for_tests(pool.clone(), &snaptrade));
    let user = users::load_user(
        &pool,
        "user-1",
        "Ada",
        "ada@example.com",
        Provisioning::CreateIfMissing,
    )
    .await
    .unwrap();
    brokerage.start_commercial(user.id, None).await.unwrap();
    snaptrade.complete_portal(
        &user.id.to_string(),
        "conn-1",
        vec![FakeAccount::investment("acct-1", "Margin")],
    );
    let choices = brokerage
        .complete_commercial(user.id, "conn-1")
        .await
        .unwrap();
    let connection = choices[0].connection_id;
    let account = brokerage
        .finalize_accounts(
            user.id,
            vec![Selection {
                connection_id: connection,
                snaptrade_account_id: "acct-1".into(),
                mode: ImportMode::OneYear,
                custom_start_date: None,
            }],
        )
        .await
        .unwrap()
        .remove(0);
    store::set_new_accounts_available(&pool, connection, true)
        .await
        .unwrap();
    let app = app(pool, Some(brokerage.clone()));
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let read = "{ brokerageConnections { id newAccountsAvailable checkedAt } }";
    let before = data(graphql(&app, &website, read, json!({})).await);
    let requests_before = snaptrade.requests().len();
    let refresh = "mutation Refresh($id: ID!) { refreshBrokerageHoldings(accountId: $id) }";
    let choices =
        "query Choices($id: ID!) { brokerageConnectionAccounts(connectionId: $id) { name } }";
    let health = "{ brokerageConnections(refresh: true) { id checkedAt } }";
    let authorization =
        "query Accounts($id: ID!) { snapTradeAuthorizationAccounts(attemptId: $id) { name } }";

    for scope in ["openid", "tradstry:read", "tradstry:read tradstry:write"] {
        let token = test_jwt::connected_app_token("user-1", scope);
        for (query, id) in [
            (refresh, account.id),
            (choices, connection),
            (health, connection),
            (authorization, connection),
        ] {
            let response = graphql(&app, &token, query, json!({ "id": id })).await;
            assert_eq!(
                response["errors"][0]["extensions"]["code"], "SESSION_REQUIRED",
                "scope={scope}, query={query}, response={response}"
            );
        }
        assert_eq!(data(graphql(&app, &token, read, json!({})).await), before);
    }
    assert_eq!(
        snaptrade.requests().len(),
        requests_before,
        "refused calls must not reach SnapTrade"
    );
    assert_eq!(data(graphql(&app, &website, read, json!({})).await), before);

    let refreshed = data(graphql(&app, &website, refresh, json!({ "id": account.id })).await);
    assert_eq!(refreshed["refreshBrokerageHoldings"], true);
    assert!(brokerage.run_due_jobs(10).await.unwrap() > 0);
    assert!(snaptrade.requests_to("/accounts/acct-1/positions/all") > 0);
    let holdings = data(
        graphql(
            &app,
            &website,
            "query Holdings($w: ID!) { brokerageHoldings(workspaceId: $w) { balances } }",
            json!({ "w": account.workspace_id.unwrap() }),
        )
        .await,
    );
    assert_eq!(
        holdings["brokerageHoldings"]["balances"][0]["currency"]["code"],
        "USD"
    );
    let accounts = data(graphql(&app, &website, choices, json!({ "id": connection })).await);
    assert_eq!(accounts["brokerageConnectionAccounts"][0]["name"], "Margin");
    let refreshed = data(graphql(&app, &website, health, json!({})).await);
    assert!(refreshed["brokerageConnections"][0]["checkedAt"].is_string());
}
