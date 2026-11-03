//! The MCP endpoint over real HTTP: discovery, the OAuth challenges ChatGPT
//! and Claude rely on, and a tool call whose numbers match the app's.

use axum::http::HeaderValue;
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::net::TcpListener;

use tradstry::{
    app::{self, AppState, Services},
    auth::test_jwt::{self, ISSUER},
    mcp::McpSettings,
};

async fn spawn(pool: PgPool) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let services = Services {
        verifier: test_jwt::connected_app_verifier(),
        mcp: Some(McpSettings {
            public_origin: origin.clone(),
            issuer: ISSUER.to_owned(),
            verifier: test_jwt::connected_app_verifier(),
        }),
        ..app::test_services(pool)
    };
    let router = app::router(
        AppState::new(services),
        vec![HeaderValue::from_static("http://localhost:5173")],
    );
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    origin
}

fn call(method: &str, params: Value) -> Value {
    let mut params = params;
    params["_meta"] = json!({
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { "name": "test", "version": "1.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
    });
    json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
}

async fn mcp(origin: &str, token: Option<&str>, method: &str, params: Value) -> reqwest::Response {
    let mut request = reqwest::Client::new()
        .post(format!("{origin}/mcp"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .header("MCP-Protocol-Version", "2026-07-28")
        .header("Mcp-Method", method)
        .json(&call(method, params));
    if let Some(name) = params_name(method) {
        request = request.header("Mcp-Name", name);
    }
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    request.send().await.unwrap()
}

fn params_name(method: &str) -> Option<&'static str> {
    (method == "tools/call").then_some("get_overview")
}

async fn graphql(origin: &str, token: &str, query: &str, variables: Value) -> Value {
    let body: Value = reqwest::Client::new()
        .post(format!("{origin}/graphql"))
        .bearer_auth(token)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(body["errors"].is_null(), "{body}");
    body["data"].clone()
}

fn challenge(response: &reqwest::Response) -> String {
    response.headers()["www-authenticate"]
        .to_str()
        .unwrap()
        .to_owned()
}

#[sqlx::test]
async fn metadata_points_clients_at_stytch(pool: PgPool) {
    let origin = spawn(pool).await;
    for path in [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
    ] {
        let metadata: Value = reqwest::get(format!("{origin}{path}"))
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            metadata,
            json!({
                "resource": format!("{origin}/mcp"),
                "authorization_servers": [ISSUER],
                "scopes_supported": ["tradstry:read"],
                "bearer_methods_supported": ["header"],
                "resource_name": "Tradstry",
            }),
            "{path}"
        );
    }
}

#[sqlx::test]
async fn calls_without_a_usable_token_are_challenged(pool: PgPool) {
    let origin = spawn(pool).await;
    let metadata =
        format!(r#"resource_metadata="{origin}/.well-known/oauth-protected-resource/mcp""#);

    let anonymous = mcp(&origin, None, "tools/list", json!({})).await;
    assert_eq!(anonymous.status(), 401);
    assert_eq!(
        challenge(&anonymous),
        format!(r#"Bearer {metadata}, scope="tradstry:read""#)
    );

    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let refused = mcp(&origin, Some(&website), "tools/list", json!({})).await;
    assert_eq!(
        refused.status(),
        401,
        "a website session token is not an MCP token"
    );
    assert!(challenge(&refused).contains(r#"error="invalid_token""#));

    let read_less = test_jwt::connected_app_token("user-1", "openid email");
    let forbidden = mcp(&origin, Some(&read_less), "tools/list", json!({})).await;
    assert_eq!(forbidden.status(), 403);
    assert!(challenge(&forbidden).contains(r#"error="insufficient_scope""#));

    let stranger = test_jwt::connected_app_token("user-nobody", "tradstry:read");
    let no_account = mcp(&origin, Some(&stranger), "tools/list", json!({})).await;
    assert_eq!(no_account.status(), 403);
    let body: Value = no_account.json().await.unwrap();
    assert_eq!(body["error"], "account_required");
}

#[sqlx::test]
async fn get_overview_answers_with_the_apps_numbers(pool: PgPool) {
    let origin = spawn(pool).await;
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let workspace = graphql(
        &origin,
        &website,
        r#"mutation { createWorkspace(name: "Paper") { id } }"#,
        json!({}),
    )
    .await["createWorkspace"]["id"]
        .clone();
    const ADD_FILL: &str = "mutation Add($w: ID!, $input: ManualFillInputObject!) { addManualFill(workspaceId: $w, input: $input) }";
    for (side, price, at) in [
        ("BUY", "100", "2026-01-02T15:00:00Z"),
        ("SELL", "110", "2026-01-05T15:00:00Z"),
    ] {
        graphql(
            &origin,
            &website,
            ADD_FILL,
            json!({"w": workspace, "input": {"instrument": {"assetClass": "STOCK", "symbol": "aapl"},
                "side": side, "quantity": "10", "price": price, "fee": "1", "executedAt": at}}),
        )
        .await;
    }

    let token = test_jwt::connected_app_token("user-1", "openid tradstry:read");
    let listed: Value = mcp(&origin, Some(&token), "tools/list", json!({}))
        .await
        .json()
        .await
        .unwrap();
    let tool = &listed["result"]["tools"][0];
    assert_eq!(tool["name"], "get_overview");
    assert_eq!(tool["annotations"]["readOnlyHint"], true);

    let called = mcp(
        &origin,
        Some(&token),
        "tools/call",
        json!({ "name": "get_overview", "arguments": { "period": "all", "workspace": "paper" } }),
    )
    .await;
    assert_eq!(called.status(), 200);
    let result: Value = called.json().await.unwrap();
    let structured = &result["result"]["structuredContent"];
    assert_eq!(
        (
            &structured["trades"],
            &structured["net"],
            &structured["workspace"]
        ),
        (&json!(1), &json!("98.00"), &json!("Paper")),
        "the same 100 profit less 2 in fees the app shows"
    );
    let summary = result["result"]["content"][0]["text"].as_str().unwrap();
    assert!(
        summary.starts_with("All time across Paper: 1 closed trade, net $98.00"),
        "{summary}"
    );

    let unknown = mcp(
        &origin,
        Some(&token),
        "tools/call",
        json!({ "name": "get_overview", "arguments": { "workspace": "Live" } }),
    )
    .await
    .json::<Value>()
    .await
    .unwrap();
    assert_eq!(unknown["result"]["isError"], true);
    let text = unknown["result"]["content"][0]["text"].as_str().unwrap();
    assert!(
        text.starts_with(r#"No workspace called "Live". Your workspaces:"#)
            && text.contains("Paper"),
        "{text}"
    );
}
