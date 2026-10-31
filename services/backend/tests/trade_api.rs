//! The trade engine through GraphQL, as a signed-in user.

use std::sync::Arc;

use async_graphql::{Request, Response, Variables};
use chrono::Utc;
use serde_json::{Value, json};
use sqlx::PgPool;

use tradstry::auth::AuthClaims;
use tradstry::auth::stytch::fake::FakeStytch;
use tradstry::auth::test_jwt::{self, PROJECT};
use tradstry::graphql::{RequestUser, build_schema};
use tradstry::trades::notes::NoteDocument;

fn session(sub: &str) -> Value {
    let now = Utc::now().timestamp();
    json!({
        "iss": format!("stytch.com/{PROJECT}"), "sub": sub, "aud": [PROJECT],
        "iat": now, "nbf": now - 10, "exp": now + 300,
        "https://stytch.com/session": {"id": format!("session-{sub}"), "authentication_factors": []},
    })
}

fn connected_app(sub: &str) -> Value {
    let now = Utc::now().timestamp();
    json!({
        "iss": format!("stytch.com/{PROJECT}"), "sub": sub, "aud": [PROJECT],
        "iat": now, "exp": now + 300, "client_id": "mcp-client", "scope": "openid",
    })
}

async fn claims(token: &Value) -> AuthClaims {
    test_jwt::test_verifier()
        .verify(&test_jwt::sign(token))
        .await
        .unwrap()
}

async fn gql(pool: &PgPool, token: &Value, query: &str, variables: Value) -> Response {
    build_schema(pool.clone(), Arc::new(FakeStytch::default()), None)
        .execute(
            Request::new(query)
                .variables(Variables::from_json(variables))
                .data(claims(token).await)
                .data(RequestUser::default()),
        )
        .await
}

async fn data(pool: &PgPool, token: &Value, query: &str, variables: Value) -> Value {
    let response = gql(pool, token, query, variables).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    response.data.into_json().unwrap()
}

fn code(response: &Response) -> Option<String> {
    let value = response.errors.first()?.extensions.as_ref()?.get("code")?;
    Some(value.to_string().trim_matches('"').to_owned())
}

async fn manual_workspace(pool: &PgPool, token: &Value) -> String {
    let created = data(
        pool,
        token,
        r#"mutation { createWorkspace(name: "Paper") { id } }"#,
        json!({}),
    )
    .await;
    created["createWorkspace"]["id"]
        .as_str()
        .unwrap()
        .to_owned()
}

const ADD_FILL: &str = "mutation Add($w: ID!, $input: ManualFillInputObject!) { addManualFill(workspaceId: $w, input: $input) }";

fn fill(side: &str, quantity: &str, price: &str, at: &str) -> Value {
    json!({
        "instrument": {"assetClass": "STOCK", "symbol": "aapl"},
        "side": side, "quantity": quantity, "price": price, "fee": "1", "executedAt": at,
    })
}

const TRADES: &str = "query T($w: ID!) { trades(workspaceId: $w) { total items { id symbol direction status net fees avgEntry avgExit fillCount annotation { id version notes tags { id name } } rMultiple } } }";

#[sqlx::test]
async fn manual_fills_become_trades_and_can_be_journaled(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;
    data(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": fill("BUY", "10", "100", "2026-01-02T15:00:00Z")}),
    )
    .await;
    data(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": fill("SELL", "10", "110", "2026-01-05T15:00:00Z")}),
    )
    .await;

    let page = data(&pool, &me, TRADES, json!({"w": w})).await;
    let trade = &page["trades"]["items"][0];
    assert_eq!(page["trades"]["total"], 1);
    assert_eq!(trade["symbol"], "AAPL");
    assert_eq!(
        (trade["direction"].as_str(), trade["status"].as_str()),
        (Some("long"), Some("closed"))
    );
    assert_eq!(trade["net"], "98.00", "100 profit less 2 in fees");
    let trade_id = trade["id"].as_str().unwrap().to_owned();

    let label = |kind: &str, name: &str| json!({"kind": kind, "input": {"name": name}});
    const CREATE: &str = "mutation C($kind: JournalLabelKind!, $input: JournalLabelInput!) { createJournalLabel(kind: $kind, input: $input) { id kind name } }";
    let orb = data(&pool, &me, CREATE, label("EDGE", "Opening range breakout")).await["createJournalLabel"]["id"].clone();
    let breakout =
        data(&pool, &me, CREATE, label("TAG", "breakout")).await["createJournalLabel"]["id"]
            .clone();
    let clash = gql(&pool, &me, CREATE, label("TAG", "  Breakout ")).await;
    assert_eq!(code(&clash).as_deref(), Some("LABEL_EXISTS"));
    assert_eq!(
        clash.errors[0]
            .extensions
            .as_ref()
            .unwrap()
            .get("existingId")
            .unwrap()
            .to_string()
            .trim_matches('"'),
        breakout.as_str().unwrap(),
        "the clash names the label to use instead"
    );

    let save = "mutation S($w: ID!, $t: ID!, $v: Int, $input: TradeAnnotationInput!) {
        saveTradeAnnotation(workspaceId: $w, tradeId: $t, expectedVersion: $v, input: $input) {
            id version notes edges { id name kind } tags { name } initialStop } }";
    let rich_note: Value = serde_json::from_str(include_str!("fixtures/rich_trade_note.json")).unwrap();
    let saved = data(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "input": {"notes": rich_note, "edgeIds": [orb], "tagIds": [breakout, breakout], "initialStop": "95"}}),
    )
    .await;
    let entry = &saved["saveTradeAnnotation"];
    assert_eq!(
        entry["edges"],
        json!([{"id": orb, "name": "Opening range breakout", "kind": "EDGE"}])
    );
    assert_eq!(
        entry["tags"],
        json!([{"name": "breakout"}]),
        "a repeated tag is kept once"
    );
    assert_eq!(entry["version"], 1);
    assert_eq!(entry["notes"], rich_note);
    let reloaded = data(&pool, &me, TRADES, json!({"w": w})).await;
    assert_eq!(reloaded["trades"]["items"][0]["annotation"]["notes"], rich_note);
    let old_format = gql(&pool, &me, save,
        json!({"w": w, "t": trade_id, "v": 1, "input": {"notes": "plain text"}})).await;
    assert_eq!(code(&old_format).as_deref(), Some("INVALID_NOTE"));

    let wrong_kind = gql(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "v": 1, "input": {"edgeIds": [breakout]}}),
    )
    .await;
    assert_eq!(code(&wrong_kind).as_deref(), Some("INVALID_LABEL"));

    let stale = gql(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "v": 7, "input": {"notes": NoteDocument::from("x").0}}),
    )
    .await;
    assert_eq!(code(&stale).as_deref(), Some("CONFLICT"));
    let again = gql(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "input": {"notes": NoteDocument::from("x").0}}),
    )
    .await;
    assert_eq!(
        code(&again).as_deref(),
        Some("CONFLICT"),
        "a second entry cannot be created over the first"
    );
    let updated = data(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "v": 1, "input": {"notes": NoteDocument::from("Better").0, "edgeIds": [orb], "initialStop": "95"}}),
    )
    .await;
    assert_eq!(updated["saveTradeAnnotation"]["version"], 2);
    assert_eq!(
        updated["saveTradeAnnotation"]["tags"],
        json!([]),
        "saving replaces the tags"
    );

    let page = data(&pool, &me, TRADES, json!({"w": w})).await;
    assert_eq!(
        page["trades"]["items"][0]["rMultiple"], "1.96",
        "98 over 5 × 10 risked"
    );

    let stats = data(
        &pool,
        &me,
        "query($w: ID) { tradeStats(workspaceId: $w) { trades wins net winRate averageWin averageWinPct averageLossPct } }",
        json!({"w": w}),
    )
    .await;
    assert_eq!(
        stats["tradeStats"],
        json!({"trades": 1, "wins": 1, "net": "98.00", "winRate": "1", "averageWin": "98.00", "averageWinPct": "9.80", "averageLossPct": null})
    );
}

#[sqlx::test]
async fn bad_fills_and_other_peoples_workspaces_are_refused(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;
    let future = (Utc::now() + chrono::Duration::days(2)).to_rfc3339();
    let response = gql(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": fill("BUY", "10", "100", &future)}),
    )
    .await;
    assert_eq!(code(&response).as_deref(), Some("FUTURE_FILL"));
    let response = gql(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": fill("BUY", "0", "100", "2026-01-02T15:00:00Z")}),
    )
    .await;
    assert_eq!(code(&response).as_deref(), Some("INVALID_QUANTITY"));

    let stranger = session("user-2");
    let response = gql(&pool, &stranger, TRADES, json!({"w": w})).await;
    assert_eq!(code(&response).as_deref(), Some("NOT_FOUND"));
    let response = gql(
        &pool,
        &stranger,
        ADD_FILL,
        json!({"w": w, "input": fill("BUY", "1", "1", "2026-01-02T15:00:00Z")}),
    )
    .await;
    assert_eq!(code(&response).as_deref(), Some("NOT_FOUND"));

    let app = connected_app("user-1");
    let response = gql(
        &pool,
        &app,
        ADD_FILL,
        json!({"w": w, "input": fill("BUY", "1", "1", "2026-01-02T15:00:00Z")}),
    )
    .await;
    assert_eq!(code(&response).as_deref(), Some("SESSION_REQUIRED"));
}

#[sqlx::test]
async fn decisions_preview_apply_and_undo(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;
    for (side, quantity, price, at) in [
        ("BUY", "10", "10", "2026-01-02T15:00:00Z"),
        ("SELL", "10", "11", "2026-01-02T16:00:00Z"),
        ("BUY", "10", "12", "2026-01-02T17:00:00Z"),
        ("SELL", "10", "13", "2026-01-02T18:00:00Z"),
    ] {
        data(
            &pool,
            &me,
            ADD_FILL,
            json!({"w": w, "input": fill(side, quantity, price, at)}),
        )
        .await;
    }
    let page = data(&pool, &me, TRADES, json!({"w": w})).await;
    let ids: Vec<Value> = page["trades"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].clone())
        .collect();
    assert_eq!(ids.len(), 2);

    let decision = json!({"kind": "merge", "tradeIds": ids});
    let preview = data(
        &pool,
        &me,
        "mutation P($w: ID!, $d: TradeDecisionInput!) { previewTradeDecision(workspaceId: $w, decision: $d) { status trades { net fillCount } } }",
        json!({"w": w, "d": decision}),
    )
    .await;
    assert_eq!(preview["previewTradeDecision"]["status"], "applied");
    assert_eq!(preview["previewTradeDecision"]["trades"][0]["net"], "16.00");
    assert_eq!(
        data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["total"],
        2,
        "a preview saves nothing"
    );

    let applied = data(
        &pool,
        &me,
        "mutation A($w: ID!, $d: TradeDecisionInput!) { applyTradeDecision(workspaceId: $w, decision: $d) { decisionId tradeIds } }",
        json!({"w": w, "d": decision}),
    )
    .await;
    assert_eq!(
        data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["total"],
        1
    );

    let refused = gql(
        &pool,
        &me,
        "mutation A($w: ID!, $d: TradeDecisionInput!) { applyTradeDecision(workspaceId: $w, decision: $d) { decisionId } }",
        json!({"w": w, "d": decision}),
    )
    .await;
    assert_eq!(code(&refused).as_deref(), Some("DECISION_REJECTED"));

    let attention = data(
        &pool,
        &me,
        "query($w: ID!) { tradeAttention(workspaceId: $w) { decisions { id status } } }",
        json!({"w": w}),
    )
    .await;
    assert_eq!(
        attention["tradeAttention"]["decisions"][0]["status"],
        "applied"
    );

    data(
        &pool,
        &me,
        "mutation U($id: ID!) { undoTradeDecision(id: $id) }",
        json!({"id": applied["applyTradeDecision"]["decisionId"]}),
    )
    .await;
    assert_eq!(
        data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["total"],
        2
    );
}

#[sqlx::test]
async fn opening_positions_fill_in_missing_history(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;
    let mut sale = fill("SELL", "10", "15", "2026-02-01T15:00:00Z");
    sale["intent"] = json!("CLOSE");
    data(&pool, &me, ADD_FILL, json!({"w": w, "input": sale})).await;
    assert_eq!(
        data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["items"][0]["status"],
        "incomplete"
    );

    data(
        &pool,
        &me,
        "mutation O($w: ID!, $input: OpeningPositionInput!) { setOpeningPosition(workspaceId: $w, input: $input) }",
        json!({"w": w, "input": {
            "instrument": {"assetClass": "STOCK", "symbol": "AAPL"}, "quantity": "10", "costPerUnit": "12",
            "acquiredAt": "2025-01-01T00:00:00Z", "asOf": "2026-01-01T00:00:00Z",
        }}),
    )
    .await;
    let trade = data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["items"][0].clone();
    assert_eq!(
        (trade["status"].as_str(), trade["net"].as_str()),
        (Some("closed"), Some("29.00"))
    );

    let tax = data(&pool, &me, "{ taxReport(year: 2026) { year longTerm { gain } shortTerm { gain } rows { term code } } }", json!({})).await;
    assert_eq!(
        tax["taxReport"]["longTerm"]["gain"], "29.00",
        "held since 2025, net of the sale fee"
    );
    assert_eq!(tax["taxReport"]["rows"][0]["term"], "long");
}

#[sqlx::test]
async fn options_carry_their_contract_details(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;
    let option = |side: &str, price: &str, at: &str| {
        json!({
            "instrument": {"assetClass": "OPTION", "symbol": "IONQ", "expiry": "2026-05-08", "right": "PUT", "strike": "37"},
            "side": side, "quantity": "1", "price": price, "executedAt": at,
        })
    };
    data(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": option("BUY", "1.68", "2026-04-29T15:00:00Z")}),
    )
    .await;
    data(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": option("SELL", "0.89", "2026-04-30T14:00:00Z")}),
    )
    .await;
    let page = data(
        &pool,
        &me,
        "query T($w: ID!) { trades(workspaceId: $w) { items { symbol underlying net option { right strike multiplier expiry } } } }",
        json!({"w": w}),
    )
    .await;
    let trade = &page["trades"]["items"][0];
    assert_eq!(trade["underlying"], "IONQ");
    assert_eq!(trade["net"], "-79.00");
    assert_eq!(
        trade["option"],
        json!({"right": "put", "strike": "37", "multiplier": "100", "expiry": "2026-05-08"})
    );
}
