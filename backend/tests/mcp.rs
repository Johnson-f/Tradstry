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
        .json(&call(method, params.clone()));
    if let Some(name) = params.get("name").and_then(Value::as_str) {
        request = request.header("Mcp-Name", name);
    }
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    request.send().await.unwrap()
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
    let tool = listed["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["name"] == "get_overview")
        .unwrap();
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
        summary.starts_with("All time across Paper: 1 closed trade, net +$98.00"),
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

/// Calls one tool and returns its result: `structuredContent`, `content` and `isError`.
async fn tool(origin: &str, token: &str, name: &str, arguments: Value) -> Value {
    let response = mcp(
        origin,
        Some(token),
        "tools/call",
        json!({ "name": name, "arguments": arguments }),
    )
    .await;
    assert_eq!(response.status(), 200, "{name}");
    let body: Value = response.json().await.unwrap();
    assert!(body["error"].is_null(), "{name}: {body}");
    body["result"].clone()
}

fn text(result: &Value) -> String {
    result["content"][0]["text"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

const ADD_FILL: &str = "mutation Add($w: ID!, $input: ManualFillInputObject!) { addManualFill(workspaceId: $w, input: $input) }";

/// A Paper workspace with an AAPL winner, an MSFT loser and an open TSLA position.
async fn seed(origin: &str, website: &str) -> Value {
    let workspace = graphql(
        origin,
        website,
        r#"mutation { createWorkspace(name: "Paper") { id } }"#,
        json!({}),
    )
    .await["createWorkspace"]["id"]
        .clone();
    for (symbol, side, quantity, price, at) in [
        ("aapl", "BUY", "10", "100", "2026-01-05T15:00:00Z"),
        ("aapl", "SELL", "10", "110", "2026-01-05T17:00:00Z"),
        ("msft", "BUY", "5", "200", "2026-01-06T15:00:00Z"),
        ("msft", "SELL", "5", "190", "2026-01-06T16:00:00Z"),
        ("tsla", "BUY", "2", "300", "2026-01-07T15:00:00Z"),
    ] {
        graphql(
            origin,
            website,
            ADD_FILL,
            json!({"w": workspace, "input": {"instrument": {"assetClass": "STOCK", "symbol": symbol},
                "side": side, "quantity": quantity, "price": price, "fee": "0", "executedAt": at}}),
        )
        .await;
    }
    workspace
}

#[sqlx::test]
async fn every_tool_and_prompt_is_listed_with_its_permission(pool: PgPool) {
    let origin = spawn(pool).await;
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    graphql(&origin, &website, "{ me { id } }", json!({})).await;
    let token = test_jwt::connected_app_token("user-1", "tradstry:read");

    let listed: Value = mcp(&origin, Some(&token), "tools/list", json!({}))
        .await
        .json()
        .await
        .unwrap();
    let tools = listed["result"]["tools"].as_array().unwrap();
    let mut names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "analyze",
            "find_trades",
            "get_overview",
            "get_trade",
            "journal_trade",
            "link_plan",
            "list_plans",
            "open_positions",
            "review_period",
            "save_plan",
            "size_position"
        ]
    );
    for tool in tools {
        let writes =
            ["journal_trade", "save_plan", "link_plan"].contains(&tool["name"].as_str().unwrap());
        assert_eq!(
            tool["annotations"]["readOnlyHint"], !writes,
            "{}",
            tool["name"]
        );
        let scopes = &tool["_meta"]["securitySchemes"][0]["scopes"];
        assert_eq!(
            scopes.as_array().unwrap().len(),
            if writes { 2 } else { 1 },
            "{}",
            tool["name"]
        );
    }

    let prompts: Value = mcp(&origin, Some(&token), "prompts/list", json!({}))
        .await
        .json()
        .await
        .unwrap();
    let mut prompt_names: Vec<&str> = prompts["result"]["prompts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["name"].as_str().unwrap())
        .collect();
    prompt_names.sort_unstable();
    assert_eq!(
        prompt_names,
        ["premarket_plan", "trade_postmortem", "weekly_review"]
    );
    let weekly: Value = mcp(
        &origin,
        Some(&token),
        "prompts/get",
        json!({ "name": "weekly_review", "arguments": { "workspace": "Paper" } }),
    )
    .await
    .json()
    .await
    .unwrap();
    let message = weekly["result"]["messages"][0]["content"]["text"]
        .as_str()
        .unwrap();
    assert!(
        message.contains("review_period") && message.contains("\"Paper\""),
        "{message}"
    );
}

#[sqlx::test]
async fn read_tools_answer_from_the_journal(pool: PgPool) {
    let origin = spawn(pool).await;
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let workspace = seed(&origin, &website).await;
    let token = test_jwt::connected_app_token("user-1", "tradstry:read");

    let by_symbol = tool(
        &origin,
        &token,
        "analyze",
        json!({ "dimension": "symbol", "period": "all" }),
    )
    .await;
    let groups: Vec<(String, String)> = by_symbol["structuredContent"]["groups"]
        .as_array()
        .unwrap()
        .iter()
        .map(|g| {
            (
                g["group"].as_str().unwrap().to_owned(),
                g["net"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    let app = graphql(
        &origin,
        &website,
        "query($w: ID) { tradeStats(workspaceId: $w) { bySymbol { key net } } }",
        json!({"w": workspace}),
    )
    .await["tradeStats"]["bySymbol"]
        .as_array()
        .unwrap()
        .iter()
        .map(|g| {
            (
                g["key"].as_str().unwrap().to_owned(),
                g["net"].as_str().unwrap().to_owned(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(groups, app, "analyze matches the app's numbers");
    assert!(
        text(&by_symbol).contains("Best: AAPL"),
        "{}",
        text(&by_symbol)
    );

    let edges = tool(
        &origin,
        &token,
        "analyze",
        json!({ "dimension": "mistake", "period": "all" }),
    )
    .await;
    assert!(
        text(&edges).contains("no trades have a mistake recorded"),
        "{}",
        text(&edges)
    );

    let review = tool(&origin, &token, "review_period", json!({ "period": "all" })).await;
    let review_data = &review["structuredContent"];
    assert_eq!(review_data["bestTrades"][0]["symbol"], "AAPL");
    assert_eq!(review_data["worstTrades"][0]["symbol"], "MSFT");
    assert_eq!(review_data["unjournaledCount"], 2);
    assert!(
        text(&review).contains("2 trades have no journal note yet"),
        "{}",
        text(&review)
    );

    let losers = tool(
        &origin,
        &token,
        "find_trades",
        json!({ "outcome": "losers" }),
    )
    .await;
    assert_eq!(losers["structuredContent"]["total"], 1);
    assert_eq!(losers["structuredContent"]["trades"][0]["symbol"], "MSFT");
    let early = tool(
        &origin,
        &token,
        "find_trades",
        json!({ "to": "2026-01-05", "status": "closed" }),
    )
    .await;
    assert_eq!(
        early["structuredContent"]["total"], 1,
        "opened by the end of Jan 5, New York time"
    );
    let bad_date = tool(
        &origin,
        &token,
        "find_trades",
        json!({ "from": "last week" }),
    )
    .await;
    assert_eq!(bad_date["isError"], true);

    let aapl_id = losers["structuredContent"]["trades"][0]["id"].clone();
    let trade = tool(&origin, &token, "get_trade", json!({ "trade_id": aapl_id })).await;
    assert_eq!(
        trade["structuredContent"]["fills"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(text(&trade).contains("No journal note yet"));

    let open = tool(&origin, &token, "open_positions", json!({})).await;
    assert_eq!(open["structuredContent"]["positions"][0]["symbol"], "TSLA");
    assert!(text(&open).contains("no current prices"), "{}", text(&open));

    let sized = tool(
        &origin,
        &token,
        "size_position",
        json!({ "symbol": "nvda", "side": "long", "entry": 100, "stop": 95, "target": 110, "risk_dollars": 200, "workspace": "Paper" }),
    )
    .await;
    assert_eq!(sized["structuredContent"]["quantity"], "40");
    assert_eq!(sized["structuredContent"]["rewardToRisk"], "2");
    let no_balance = tool(
        &origin,
        &token,
        "size_position",
        json!({ "symbol": "nvda", "side": "long", "entry": 100, "stop": 95, "risk_percent": 1, "workspace": "Paper" }),
    )
    .await;
    assert_eq!(no_balance["isError"], true);
    assert!(
        text(&no_balance).contains("no account balance"),
        "{}",
        text(&no_balance)
    );
}

#[sqlx::test]
async fn writes_need_the_write_permission(pool: PgPool) {
    let origin = spawn(pool).await;
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    seed(&origin, &website).await;
    let reader = test_jwt::connected_app_token("user-1", "tradstry:read");
    let refused = mcp(
        &origin,
        Some(&reader),
        "tools/call",
        json!({ "name": "journal_trade", "arguments": { "trade_id": "x", "note": "hi" } }),
    )
    .await;
    assert_eq!(refused.status(), 403);
    let header = challenge(&refused);
    assert!(header.contains(r#"error="insufficient_scope""#), "{header}");
    assert!(
        header.contains(r#"scope="tradstry:read tradstry:write""#),
        "{header}"
    );
    let reads_still_work = tool(&origin, &reader, "list_plans", json!({})).await;
    assert_eq!(reads_still_work["isError"], false);
}

#[sqlx::test]
async fn journaling_and_plans_reach_the_app(pool: PgPool) {
    let origin = spawn(pool).await;
    let website = test_jwt::session_token("user-1", "ada@example.com", "Ada");
    let workspace = seed(&origin, &website).await;
    let writer = test_jwt::connected_app_token("user-1", "tradstry:read tradstry:write");
    let msft = tool(&origin, &writer, "find_trades", json!({ "symbol": "MSFT" })).await["structuredContent"]["trades"][0]["id"]
        .clone();

    let first = tool(
        &origin,
        &writer,
        "journal_trade",
        json!({ "trade_id": msft, "note": "Chased the open.", "mistakes": ["Chased entry"], "edges": ["Gap fill"],
            "conviction": 2, "revenge_trade": true }),
    )
    .await;
    assert_eq!(first["isError"], false, "{}", text(&first));
    let second = tool(
        &origin,
        &writer,
        "journal_trade",
        json!({ "trade_id": msft, "note": "Size was right." }),
    )
    .await;
    let note = second["structuredContent"]["note"].as_str().unwrap();
    assert!(
        note.contains("Chased the open.") && note.contains("Size was right."),
        "appending keeps the first note: {note}"
    );
    assert_eq!(
        second["structuredContent"]["trade"]["mistakes"],
        json!(["Chased entry"]),
        "labels stay"
    );

    let app = graphql(
        &origin,
        &website,
        "query($w: ID!) { trades(workspaceId: $w, filter: { symbol: \"MSFT\" }) { items { annotation { mistakes { name } edges { name } behavior { conviction revengeTrade } } } } }",
        json!({"w": workspace}),
    )
    .await;
    assert_eq!(
        app["trades"]["items"][0]["annotation"],
        json!({ "mistakes": [{"name": "Chased entry"}], "edges": [{"name": "Gap fill"}], "behavior": {"conviction": 2, "revengeTrade": true} })
    );
    let by_mistake = tool(
        &origin,
        &writer,
        "find_trades",
        json!({ "label": "chased entry" }),
    )
    .await;
    assert_eq!(
        by_mistake["structuredContent"]["total"], 1,
        "labels are found by name, any case"
    );

    let saved = tool(
        &origin,
        &writer,
        "save_plan",
        json!({ "symbol": "tsla", "side": "long", "entry": 300, "stop": 290, "risk_dollars": 100, "workspace": "Paper", "note": "Base breakout" }),
    )
    .await;
    assert_eq!(saved["structuredContent"]["quantity"], "10");
    let plan_id = saved["structuredContent"]["planId"].clone();
    let open_plans = tool(&origin, &writer, "list_plans", json!({})).await;
    assert_eq!(
        open_plans["structuredContent"]["plans"][0]["note"],
        "Base breakout"
    );

    let tsla =
        tool(&origin, &writer, "open_positions", json!({})).await["structuredContent"]["positions"]
            [0]["id"]
            .clone();
    let linked = tool(
        &origin,
        &writer,
        "link_plan",
        json!({ "plan_id": plan_id, "trade_id": tsla }),
    )
    .await;
    assert_eq!(linked["isError"], false, "{}", text(&linked));
    let trade =
        tool(&origin, &writer, "get_trade", json!({ "trade_id": tsla })).await["structuredContent"]
            .clone();
    assert_eq!(
        (&trade["initialStop"], &trade["plannedRisk"]),
        (&json!("290"), &json!("100"))
    );
    assert_eq!(trade["plan"]["note"], "Base breakout");
    let none_open = tool(&origin, &writer, "list_plans", json!({})).await;
    assert_eq!(none_open["structuredContent"]["plans"], json!([]));
}
