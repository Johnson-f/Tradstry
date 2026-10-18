use crate::journal_flow_pg::{FillAmounts, enabled_workspace, fill, project};
use sqlx::PgPool;
use tradstry_backend::service::trade_review::journal_flow::{
    self,
    action_notes::{self, JoinInput, NoteInput, NoteView, TradeActions},
};

struct Trade {
    pool: PgPool,
    user: String,
    workspace: String,
}

impl Trade {
    async fn new(pool: &PgPool) -> Self {
        let (user, workspace) = enabled_workspace(pool).await;
        Self {
            pool: pool.clone(),
            user,
            workspace,
        }
    }

    fn execution(&self, name: &str) -> String {
        format!("{}:{name}", self.workspace)
    }

    async fn fill(&self, name: &str, side: &str, quantity: f64, at: &str) {
        fill(
            &self.pool,
            &self.user,
            &self.workspace,
            name,
            side,
            FillAmounts {
                quantity,
                price: 10.0,
                fee: 0.0,
            },
            at,
        )
        .await;
        project(&self.pool, &self.user, &self.workspace).await;
    }

    async fn entry(&self) -> String {
        let trades = journal_flow::list_trades(&self.pool, &self.user, &self.workspace)
            .await
            .unwrap();
        assert_eq!(trades.len(), 1, "{trades:?}");
        trades[0].id.clone()
    }

    async fn actions(&self) -> TradeActions {
        action_notes::trade_actions(&self.pool, &self.user, &self.workspace, &self.entry().await)
            .await
            .unwrap()
    }

    async fn note(
        &self,
        anchor: &str,
        role: &str,
        version: Option<i64>,
        reason: &str,
        mutation: &str,
    ) -> anyhow::Result<NoteView> {
        action_notes::save_note(
            &self.pool,
            &self.user,
            &self.workspace,
            NoteInput {
                entry_id: self.entry().await,
                anchor_execution_id: self.execution(anchor),
                anchor_role: role.into(),
                expected_version: version,
                reason: reason.into(),
                stop_price: Some("9".into()),
                target_price: None,
            },
            "test-client",
            mutation,
        )
        .await
    }

    async fn hindsight(&self, parent: &str, mutation: &str) -> anyhow::Result<NoteView> {
        action_notes::add_hindsight(
            &self.pool,
            &self.user,
            &self.workspace,
            parent,
            "Sized too big for the setup",
            "test-client",
            mutation,
        )
        .await
    }
}

fn kinds(actions: &TradeActions) -> Vec<&str> {
    actions.actions.iter().map(|a| a.kind.as_str()).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn an_entry_note_stays_editable_until_the_next_execution() {
    let test_db = crate::pg_support::TestDb::new().await;
    let trade = Trade::new(&test_db.pool()).await;
    trade.fill("b1", "BUY", 10.0, "2026-09-02T15:00:00Z").await;

    let note = trade
        .note("b1", "entry", None, "Breakout over 10", "n1")
        .await
        .unwrap();
    assert!(!note.locked && !note.written_late);
    assert_eq!(note.stop_price.as_deref(), Some("9"));
    let edited = trade
        .note(
            "b1",
            "entry",
            Some(note.version),
            "Breakout over 10, volume",
            "n2",
        )
        .await
        .unwrap();
    assert_eq!(edited.id, note.id);
    assert!(
        trade.hindsight(&note.id, "h0").await.is_err(),
        "an editable note is changed directly"
    );

    trade.fill("b2", "BUY", 5.0, "2026-09-03T15:00:00Z").await;
    let actions = trade.actions().await;
    assert_eq!(kinds(&actions), ["entry", "add"]);
    let locked = &actions.actions[0].notes[0];
    assert!(locked.locked);
    let refused = trade
        .note("b1", "entry", Some(locked.version), "Rewritten later", "n3")
        .await;
    assert!(refused.unwrap_err().to_string().contains("locked"));

    let hindsight = trade.hindsight(&note.id, "h1").await.unwrap();
    assert_eq!(hindsight.kind, "hindsight");
    assert_eq!(hindsight.parent_id.as_deref(), Some(note.id.as_str()));
    let replayed = trade.hindsight(&note.id, "h1").await.unwrap();
    assert_eq!(replayed.id, hindsight.id);
    let notes = &trade.actions().await.actions[0].notes;
    assert_eq!(
        notes.iter().map(|n| n.kind.as_str()).collect::<Vec<_>>(),
        ["plan", "hindsight"]
    );
    assert_eq!(notes[0].reason, "Breakout over 10, volume");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_note_written_after_the_fact_is_labelled_and_locks_on_review() {
    use journal_flow::reflection;
    let test_db = crate::pg_support::TestDb::new().await;
    let trade = Trade::new(&test_db.pool()).await;
    trade.fill("b1", "BUY", 10.0, "2026-09-02T15:00:00Z").await;
    trade.fill("s1", "SELL", 10.0, "2026-09-02T16:00:00Z").await;
    let trade_now = || async {
        journal_flow::get_trade(
            &trade.pool,
            &trade.user,
            &trade.workspace,
            &trade.entry().await,
        )
        .await
        .unwrap()
        .unwrap()
    };
    let before = trade_now().await;
    assert!(!before.has_entry_note);
    assert_eq!(before.realized_r, None);
    let late = trade
        .note("b1", "entry", None, "Gap fill", "n1")
        .await
        .unwrap();
    assert!(late.written_late);
    let noted = trade_now().await;
    assert!(noted.has_entry_note);
    assert_eq!(noted.realized_r.as_deref(), Some("0"));
    assert!(
        !late.locked,
        "the trade hasn't moved on since it was written"
    );
    let exit = trade
        .note("s1", "exit", None, "Hit target", "n2")
        .await
        .unwrap();
    assert!(!exit.written_late);

    let entry = trade.entry().await;
    let current = journal_flow::get_trade(&trade.pool, &trade.user, &trade.workspace, &entry)
        .await
        .unwrap()
        .unwrap();
    let draft = reflection::save_draft(
        &trade.pool,
        &trade.user,
        &trade.workspace,
        reflection::DraftInput {
            entry_id: entry.clone(),
            expected_version: 0,
            takeaway: "Waited for the setup".into(),
            choice_ids: vec![],
            plan_adherence: None,
        },
        "test-client",
        "draft",
    )
    .await
    .unwrap();
    reflection::finalize(
        &trade.pool,
        &trade.user,
        &trade.workspace,
        reflection::ReviewInput {
            entry_id: entry,
            expected_entry_revision: current.materialized_revision,
            expected_context_version: 0,
            expected_draft_version: draft.version,
            session_id: None,
        },
        "test-client",
        "review",
    )
    .await
    .unwrap();
    let actions = trade.actions().await;
    assert!(
        actions
            .actions
            .iter()
            .all(|a| a.notes.iter().all(|n| n.locked))
    );
    let snapshot: serde_json::Value =
        sqlx::query_scalar("SELECT snapshot_json FROM journal_trade_reviews WHERE entry_id=$1")
            .bind(trade.entry().await)
            .fetch_one(&trade.pool)
            .await
            .unwrap();
    assert_eq!(snapshot["reviewOutcome"]["stop_source"], "entry_note");
    assert_eq!(snapshot["reviewOutcome"]["initial_risk"], "10");
    assert_eq!(snapshot["reviewOutcome"]["realized_r"], "0");
    assert_eq!(
        snapshot["actionTimeline"]["actions"][0]["notes"][0]["reason"],
        "Gap fill"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn notes_follow_their_execution_and_survive_its_removal() {
    let test_db = crate::pg_support::TestDb::new().await;
    let trade = Trade::new(&test_db.pool()).await;
    trade.fill("b1", "BUY", 10.0, "2026-09-02T15:00:00Z").await;
    trade.fill("s1", "SELL", 10.0, "2026-09-02T16:00:00Z").await;
    trade
        .note("s1", "exit", None, "Took profit into resistance", "n1")
        .await
        .unwrap();

    trade.fill("b0", "BUY", 5.0, "2026-09-02T14:00:00Z").await;
    let moved = trade.actions().await;
    assert_eq!(kinds(&moved), ["entry", "add", "trim"]);
    assert_eq!(
        moved.actions[2].notes[0].reason,
        "Took profit into resistance"
    );

    sqlx::query("DELETE FROM brokerage_transactions WHERE id=$1")
        .bind(trade.execution("s1"))
        .execute(&trade.pool)
        .await
        .unwrap();
    project(&trade.pool, &trade.user, &trade.workspace).await;
    let orphans = action_notes::orphaned(&trade.pool, &trade.user, &trade.workspace)
        .await
        .unwrap();
    assert_eq!(orphans.len(), 1);
    assert!(orphans[0].orphaned);
    assert_eq!(orphans[0].reason, "Took profit into resistance");
    action_notes::keep_orphan(
        &trade.pool,
        &trade.user,
        &trade.workspace,
        &orphans[0].id,
        "test-client",
        "keep",
    )
    .await
    .unwrap();
    assert!(
        action_notes::orphaned(&trade.pool, &trade.user, &trade.workspace)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn split_fills_can_be_combined_into_one_action() {
    let test_db = crate::pg_support::TestDb::new().await;
    let trade = Trade::new(&test_db.pool()).await;
    trade
        .fill("b1", "BUY", 7.0, "2026-09-02T15:00:00.000Z")
        .await;
    trade
        .fill("b2", "BUY", 3.0, "2026-09-02T15:00:00.001Z")
        .await;
    trade.fill("s1", "SELL", 10.0, "2026-09-02T16:00:00Z").await;
    let before = trade.actions().await;
    assert_eq!(kinds(&before), ["entry", "add", "exit"]);
    let pieces = vec![trade.execution("b1"), trade.execution("b2")];
    assert_eq!(before.suggested_joins, std::slice::from_ref(&pieces));

    let join = |executions: Vec<String>, mutation: &'static str| {
        let trade = &trade;
        async move {
            action_notes::join(
                &trade.pool,
                &trade.user,
                &trade.workspace,
                JoinInput {
                    entry: &trade.entry().await,
                    execution_ids: &executions,
                },
                "test-client",
                mutation,
            )
            .await
        }
    };
    assert!(
        join(vec![trade.execution("b2"), trade.execution("s1")], "bad")
            .await
            .unwrap_err()
            .to_string()
            .contains("same side")
    );
    let join_id = join(pieces, "join").await.unwrap();
    let joined = trade.actions().await;
    assert_eq!(kinds(&joined), ["entry", "exit"]);
    assert_eq!(joined.actions[0].quantity, "10");
    assert!(joined.suggested_joins.is_empty());

    action_notes::unjoin(
        &trade.pool,
        &trade.user,
        &trade.workspace,
        &join_id,
        "test-client",
        "unjoin",
    )
    .await
    .unwrap();
    assert_eq!(kinds(&trade.actions().await), ["entry", "add", "exit"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_entry_note_stop_defines_risk_in_analytics() {
    use tradstry_backend::service::trading_performance::load_trading_performance;
    let test_db = crate::pg_support::TestDb::new().await;
    let trade = Trade::new(&test_db.pool()).await;
    let at = |hours: i64| (chrono::Utc::now() + chrono::Duration::hours(hours)).to_rfc3339();
    trade.fill("b1", "BUY", 10.0, &at(-1)).await;
    trade
        .note("b1", "entry", None, "Stop under the base", "n1")
        .await
        .unwrap();
    trade.fill("s1", "SELL", 10.0, &at(1)).await;
    let performance =
        load_trading_performance(&trade.pool, &trade.user, &trade.workspace, None, None)
            .await
            .unwrap();
    assert_eq!(performance.risk_defined_trade_count, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_combine_that_a_sync_splits_apart_is_listed() {
    use tradstry_backend::service::trade_review::journal_flow::attention;
    let test_db = crate::pg_support::TestDb::new().await;
    let trade = Trade::new(&test_db.pool()).await;
    trade
        .fill("b1", "BUY", 7.0, "2026-09-02T15:00:00.000Z")
        .await;
    trade
        .fill("b2", "BUY", 3.0, "2026-09-02T15:00:00.010Z")
        .await;
    let entry = trade.entry().await;
    let executions = vec![trade.execution("b1"), trade.execution("b2")];
    let join = action_notes::join(
        &trade.pool,
        &trade.user,
        &trade.workspace,
        JoinInput {
            entry: &entry,
            execution_ids: &executions,
        },
        "test-client",
        "join",
    )
    .await
    .unwrap();
    assert!(
        attention::broken_joins(&trade.pool, &trade.user, &trade.workspace)
            .await
            .unwrap()
            .is_empty()
    );
    trade
        .fill("s0", "SELL", 2.0, "2026-09-02T15:00:00.005Z")
        .await;
    let broken = attention::broken_joins(&trade.pool, &trade.user, &trade.workspace)
        .await
        .unwrap();
    assert_eq!(broken.len(), 1);
    assert_eq!(broken[0].join_id, join);
    assert_eq!(broken[0].entry_id, entry);
}
