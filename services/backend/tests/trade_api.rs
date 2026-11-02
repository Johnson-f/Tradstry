//! The trade engine through GraphQL, as a signed-in user.

use std::sync::Arc;

use async_graphql::{Request, Response, Variables};
use chrono::Utc;
use serde_json::{Value, json};
use sqlx::PgPool;

use tradstry::{
    auth::{
        AuthClaims,
        stytch::fake::FakeStytch,
        test_jwt::{self, PROJECT},
    },
    graphql::{RequestUser, build_schema},
    trades::notes::NoteDocument,
};

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
            id version notes edges { id name kind } tags { name } initialStop
            behavior { conviction marketRegime plannedPreMarket revengeTrade brokeThirtyMinuteRule ruleAdherence } } }";
    let rich_note: Value =
        serde_json::from_str(include_str!("fixtures/rich_trade_note.json")).unwrap();
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
    assert_eq!(
        reloaded["trades"]["items"][0]["annotation"]["notes"],
        rich_note
    );
    let old_format = gql(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "v": 1, "input": {"notes": "plain text"}}),
    )
    .await;
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
    let out_of_range = gql(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "v": 1, "input": {"behavior": {"conviction": 6}}}),
    )
    .await;
    assert_eq!(code(&out_of_range).as_deref(), Some("INVALID_SCORE"));
    assert_eq!(
        entry["behavior"]["conviction"],
        json!(null),
        "nothing recorded yet"
    );
    let behavior = json!({"conviction": 4, "marketRegime": "TRENDING", "plannedPreMarket": true,
        "revengeTrade": false, "brokeThirtyMinuteRule": null, "ruleAdherence": 5});
    let updated = data(
        &pool,
        &me,
        save,
        json!({"w": w, "t": trade_id, "v": 1, "input": {"notes": NoteDocument::from("Better").0, "edgeIds": [orb], "initialStop": "95", "behavior": behavior}}),
    )
    .await;
    assert_eq!(updated["saveTradeAnnotation"]["version"], 2);
    assert_eq!(updated["saveTradeAnnotation"]["behavior"], behavior);
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
    const BREAKDOWNS: &str = "query($w: ID) { tradeStats(workspaceId: $w) {
        bySession { key trades } rDistribution { key trades } byDiscipline { key trades }
        byPreviousTrade { key trades } tradesPerDay { key days trades } recoveryFactor
        behavior { recorded averageConviction byMarketRegime { key trades } byPlanned { key }
            byRevenge { key } byThirtyMinuteRule { key } byRuleAdherence { key } }
    } }";
    let breakdowns = data(&pool, &me, BREAKDOWNS, json!({"w": w})).await["tradeStats"].clone();
    assert_eq!(
        breakdowns["bySession"],
        json!([{"key": "First hour", "trades": 1}]),
        "opened at 10:00 in New York"
    );
    assert_eq!(
        breakdowns["rDistribution"][4],
        json!({"key": "1R to 2R", "trades": 1}),
        "1.96R"
    );
    assert_eq!(
        breakdowns["byDiscipline"],
        json!([{"key": "No mistakes", "trades": 1}, {"key": "With mistakes", "trades": 0}])
    );
    assert_eq!(
        breakdowns["byPreviousTrade"],
        json!([{"key": "First trade of the day", "trades": 1}])
    );
    assert_eq!(
        breakdowns["tradesPerDay"],
        json!([{"key": "1 trade", "days": 1, "trades": 1}])
    );
    assert_eq!(breakdowns["recoveryFactor"], json!(null), "no drawdown yet");
    assert_eq!(
        breakdowns["behavior"],
        json!({"recorded": 1, "averageConviction": "4", "byMarketRegime": [{"key": "Trending", "trades": 1}],
            "byPlanned": [{"key": "Planned pre-market"}], "byRevenge": [{"key": "Not a revenge trade"}],
            "byThirtyMinuteRule": [], "byRuleAdherence": [{"key": "5/5"}]})
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

#[sqlx::test]
async fn settings_round_trip(pool: PgPool) {
    let me = session("user-1");
    const READ: &str =
        "{ settings { defaultRisk breakevenBand timeZone weekStart defaultPeriod } }";
    let defaults = data(&pool, &me, READ, json!({})).await;
    assert_eq!(
        defaults["settings"],
        json!({"defaultRisk": null, "breakevenBand": "0", "timeZone": "LOCAL", "weekStart": "SUNDAY", "defaultPeriod": "1m"})
    );

    const UPDATE: &str = "mutation U($input: UserSettingsInput!) { updateSettings(input: $input) {
        defaultRisk breakevenBand timeZone weekStart defaultPeriod } }";
    let input = json!({"defaultRisk": "50", "breakevenBand": "1", "timeZone": "MARKET", "weekStart": "MONDAY", "defaultPeriod": "ytd"});
    let saved = data(&pool, &me, UPDATE, json!({"input": input})).await;
    assert_eq!(saved["updateSettings"], input);
    assert_eq!(data(&pool, &me, READ, json!({})).await["settings"], input);

    let bad = gql(
        &pool,
        &me,
        UPDATE,
        json!({"input": {"defaultRisk": "-5", "breakevenBand": "0", "timeZone": "MARKET", "weekStart": "SUNDAY", "defaultPeriod": "1m"}}),
    )
    .await;
    assert_eq!(code(&bad).as_deref(), Some("INVALID_RISK"));
}

#[sqlx::test]
async fn plans_size_link_skip_and_count(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;

    const RULE: &str = "mutation R($w: ID!, $input: PlanningRuleInput!) { savePlanningRule(workspaceId: $w, input: $input) {
        balance source linked riskPercent maxStopPercent } }";
    let rule = data(&pool, &me, RULE, json!({"w": w, "input": {"manualBalance": "25000", "riskPercent": "1", "maxStopPercent": "8"}})).await;
    assert_eq!(
        rule["savePlanningRule"],
        json!({"balance": "25000", "source": "MANUAL", "linked": false, "riskPercent": "1", "maxStopPercent": "8"})
    );
    let negative = gql(
        &pool,
        &me,
        RULE,
        json!({"w": w, "input": {"manualBalance": "-5"}}),
    )
    .await;
    assert_eq!(code(&negative).as_deref(), Some("INVALID_BALANCE"));
    let too_much = gql(
        &pool,
        &me,
        RULE,
        json!({"w": w, "input": {"riskPercent": "150"}}),
    )
    .await;
    assert_eq!(code(&too_much).as_deref(), Some("INVALID_RISK"));

    const CREATE: &str = "mutation C($w: ID!, $input: TradePlanInput!) { createTradePlan(workspaceId: $w, input: $input) {
        id symbol quantity actualRisk cost status tradeId } }";
    let plan = |entry: &str, stop: &str| {
        json!({"w": w, "input": {"assetClass": "STOCK", "symbol": " aapl ", "direction": "LONG",
            "tranches": [{"percent": "100", "entry": entry}], "stop": stop, "target": "110", "risk": "200"}})
    };
    let created = data(&pool, &me, CREATE, plan("100", "95")).await["createTradePlan"].clone();
    assert_eq!(
        (
            &created["symbol"],
            &created["quantity"],
            &created["actualRisk"],
            &created["cost"],
            &created["status"]
        ),
        (
            &json!("AAPL"),
            &json!("40"),
            &json!("200.00"),
            &json!("4000.00"),
            &json!("OPEN")
        )
    );
    let bad_stop = gql(&pool, &me, CREATE, plan("100", "105")).await;
    let ladder = data(
        &pool,
        &me,
        "mutation C($w: ID!, $input: TradePlanInput!) { createTradePlan(workspaceId: $w, input: $input) {
            entry quantity roundUp tranches { percent entry quantity risk } } }",
        json!({"w": w, "input": {"assetClass": "STOCK", "symbol": "msft", "direction": "LONG", "stop": "95",
            "risk": "200", "roundUp": true, "tranches": [{"percent": "50", "entry": "100"}, {"percent": "50", "entry": "98"}]}}),
    )
    .await;
    assert_eq!(
        ladder["createTradePlan"],
        json!({"entry": "98.7407", "quantity": "54", "roundUp": true, "tranches": [
            {"percent": "50", "entry": "100", "quantity": "20", "risk": "100.00"},
            {"percent": "50", "entry": "98", "quantity": "34", "risk": "102.00"}]})
    );
    assert_eq!(code(&bad_stop).as_deref(), Some("INVALID_STOP"));
    let spare = data(&pool, &me, CREATE, plan("100", "98")).await["createTradePlan"]["id"].clone();

    for (side, at) in [
        ("BUY", "2026-01-02T15:00:00Z"),
        ("SELL", "2026-01-05T15:00:00Z"),
    ] {
        data(&pool, &me, ADD_FILL, json!({"w": w, "input": fill(side, "40", if side == "BUY" { "100" } else { "104" }, at)})).await;
    }
    let trade_id =
        data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["items"][0]["id"].clone();

    const LINK: &str =
        "mutation L($id: ID!, $t: ID!) { linkTradePlan(id: $id, tradeId: $t) { status tradeId } }";
    let linked = data(
        &pool,
        &me,
        LINK,
        json!({"id": created["id"], "t": trade_id}),
    )
    .await;
    assert_eq!(
        linked["linkTradePlan"],
        json!({"status": "LINKED", "tradeId": trade_id})
    );
    let twice = gql(&pool, &me, LINK, json!({"id": spare, "t": trade_id})).await;
    assert_eq!(
        code(&twice).as_deref(),
        Some("PLAN_EXISTS"),
        "a trade carries one plan"
    );
    let edit_linked = gql(
        &pool,
        &me,
        "mutation U($id: ID!, $input: TradePlanInput!) { updateTradePlan(id: $id, input: $input) { id } }",
        json!({"id": created["id"], "input": plan("100", "95")["input"]}),
    )
    .await;
    assert_eq!(code(&edit_linked).as_deref(), Some("PLAN_LINKED"));

    sqlx::query("UPDATE trade_plans SET trade_id = 'vanished' WHERE id = $1::uuid")
        .bind(created["id"].as_str().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let other = fill("BUY", "1", "50", "2026-01-03T15:00:00Z");
    data(&pool, &me, ADD_FILL, json!({"w": w, "input": {"instrument": {"assetClass": "STOCK", "symbol": "msft"}, "side": "BUY",
        "quantity": "1", "price": "50", "fee": "0", "executedAt": other["executedAt"]}})).await;
    const PLANS: &str = "query P($w: ID!) { tradePlans(workspaceId: $w) { id status tradeId } }";
    let plans = data(&pool, &me, PLANS, json!({"w": w})).await["tradePlans"].clone();
    let aapl = data(&pool, &me, TRADES, json!({"w": w})).await["trades"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["symbol"] == "AAPL")
        .unwrap()["id"]
        .clone();
    assert!(
        plans
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["tradeId"] == aapl && p["status"] == "LINKED"),
        "the link survives a rebuild"
    );

    data(
        &pool,
        &me,
        "mutation S($id: ID!) { skipTradePlan(id: $id, skipped: true) { status } }",
        json!({"id": spare}),
    )
    .await;
    let stats = data(
        &pool,
        &me,
        "query($w: ID) { tradeStats(workspaceId: $w) { plans { fromPlan skipped byPlan { key trades } } } }",
        json!({"w": w}),
    )
    .await;
    assert_eq!(
        stats["tradeStats"]["plans"],
        json!({"fromPlan": 1, "skipped": 1, "byPlan": [{"key": "From a plan", "trades": 1}]})
    );

    let unlinked = data(
        &pool,
        &me,
        "mutation U($id: ID!) { unlinkTradePlan(id: $id) { status tradeId } }",
        json!({"id": created["id"]}),
    )
    .await;
    assert_eq!(
        unlinked["unlinkTradePlan"],
        json!({"status": "OPEN", "tradeId": null})
    );
    data(
        &pool,
        &me,
        "mutation D($id: ID!) { deleteTradePlan(id: $id) }",
        json!({"id": created["id"]}),
    )
    .await;

    let stranger = session("user-2");
    let hidden = gql(&pool, &stranger, PLANS, json!({"w": w})).await;
    assert_eq!(code(&hidden).as_deref(), Some("NOT_FOUND"));
    let not_theirs = gql(&pool, &stranger, LINK, json!({"id": spare, "t": trade_id})).await;
    assert_eq!(code(&not_theirs).as_deref(), Some("NOT_FOUND"));
}

#[sqlx::test]
async fn writes_announce_one_change_per_workspace_not_per_row(pool: PgPool) {
    let me = session("user-1");
    let w = manual_workspace(&pool, &me).await;
    let mut listener = sqlx::postgres::PgListener::connect_with(&pool)
        .await
        .unwrap();
    listener.listen(tradstry::realtime::CHANNEL).await.unwrap();

    for day in 2..12 {
        data(
            &pool,
            &me,
            ADD_FILL,
            json!({"w": w, "input": fill("BUY", "1", "100", &format!("2026-01-{day:02}T15:00:00Z"))}),
        )
        .await;
    }
    data(
        &pool,
        &me,
        ADD_FILL,
        json!({"w": w, "input": fill("SELL", "10", "110", "2026-01-20T15:00:00Z")}),
    )
    .await;

    let mut payloads = Vec::new();
    while let Ok(Ok(Some(notification))) =
        tokio::time::timeout(std::time::Duration::from_millis(300), listener.try_recv()).await
    {
        payloads.push(serde_json::from_str::<Value>(notification.payload()).unwrap());
    }
    let user = payloads[0]["u"].clone();
    assert!(payloads.iter().all(|p| p["u"] == user));
    assert!(
        payloads.contains(&json!({"u": user, "w": w, "t": "trades"})),
        "{payloads:?}"
    );
    assert!(
        payloads.len() <= 11 * 4,
        "a few messages per write, not one per row: {}",
        payloads.len()
    );
}
