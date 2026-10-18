use crate::journal_flow_pg::{FillAmounts, enabled_workspace, fill, project};
use sqlx::PgPool;
use tradstry_backend::service::trade_review::journal_flow::{
    self, reflection,
    sessions::{self, OpenSessionInput, ReviewSession, SkipInput},
};

async fn open(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    date: &str,
    mutation: &str,
) -> ReviewSession {
    sessions::open(
        pool,
        user,
        workspace,
        OpenSessionInput {
            date: Some(date),
            refresh: false,
            expected_version: None,
        },
        "test-client",
        mutation,
    )
    .await
    .unwrap()
    .unwrap()
}

fn groups(session: &ReviewSession) -> Vec<(&str, &str)> {
    session
        .items
        .iter()
        .map(|item| (item.group.as_str(), item.state.as_str()))
        .collect()
}

async fn review(pool: &PgPool, user: &str, workspace: &str, entry: &str, session: &str) {
    let trade = journal_flow::get_trade(pool, user, workspace, entry)
        .await
        .unwrap()
        .unwrap();
    let draft = reflection::save_draft(
        pool,
        user,
        workspace,
        reflection::DraftInput {
            entry_id: entry.into(),
            expected_version: 0,
            takeaway: "Followed the plan".into(),
            choice_ids: vec![],
            plan_adherence: None,
        },
        "test-client",
        &format!("draft-{entry}"),
    )
    .await
    .unwrap();
    reflection::finalize(
        pool,
        user,
        workspace,
        reflection::ReviewInput {
            entry_id: entry.into(),
            expected_entry_revision: trade.materialized_revision,
            expected_context_version: 0,
            expected_draft_version: draft.version,
            session_id: Some(session.into()),
        },
        "test-client",
        &format!("review-{entry}"),
    )
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn the_daily_review_covers_exits_open_trades_and_trades_set_aside() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE workspaces SET journal_timezone='UTC' WHERE id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    for (name, side, at) in [
        ("earlier-buy", "BUY", "2026-09-01T14:00:00Z"),
        ("earlier-sell", "SELL", "2026-09-01T15:00:00Z"),
        ("day-buy", "BUY", "2026-09-02T14:00:00Z"),
        ("day-sell", "SELL", "2026-09-02T15:00:00Z"),
        ("open-buy", "BUY", "2026-09-02T16:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity: 10.0,
                price: 10.0,
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    project(&pool, &user, &workspace).await;

    let day = open(&pool, &user, &workspace, "2026-09-02", "open-1").await;
    assert_eq!(groups(&day), [("exited", "pending"), ("open", "none")]);
    assert!(!day.complete);
    let exited = day.items[0].entry_id.clone();

    sessions::skip(
        &pool,
        &user,
        &workspace,
        SkipInput {
            entry: &day.items[1].entry_id,
            reason: "too_small",
            session: Some(&day.id),
        },
        "test-client",
        "skip-open",
    )
    .await
    .unwrap_err();
    sessions::skip(
        &pool,
        &user,
        &workspace,
        SkipInput {
            entry: &exited,
            reason: "review_later",
            session: Some(&day.id),
        },
        "test-client",
        "later",
    )
    .await
    .unwrap();
    let day = open(&pool, &user, &workspace, "2026-09-02", "open-2").await;
    assert!(day.complete);
    assert_eq!(day.skipped_count, 1);
    assert_eq!(day.items[0].skip_reason.as_deref(), Some("review_later"));

    let next = open(&pool, &user, &workspace, "2026-09-03", "open-3").await;
    assert_eq!(next.queue, std::slice::from_ref(&exited));
    assert_eq!(groups(&next), [("exited", "pending")]);
    review(&pool, &user, &workspace, &exited, &next.id).await;
    let next = open(&pool, &user, &workspace, "2026-09-03", "open-4").await;
    assert!(next.complete);
    assert_eq!(next.reviewed_count, 1);
    assert_eq!(next.cursor_entry_id, None);
    assert!(
        open(&pool, &user, &workspace, "2026-09-04", "open-5")
            .await
            .queue
            .is_empty()
    );

    let earlier = open(&pool, &user, &workspace, "2026-09-01", "open-6").await;
    let earlier_entry = earlier.items[0].entry_id.clone();
    sessions::skip(
        &pool,
        &user,
        &workspace,
        SkipInput {
            entry: &earlier_entry,
            reason: "mistake_fill",
            session: Some(&earlier.id),
        },
        "test-client",
        "mistake",
    )
    .await
    .unwrap();
    let skipped = journal_flow::get_trade(&pool, &user, &workspace, &earlier_entry)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(skipped.review_state, "skipped");
    sessions::unskip(
        &pool,
        &user,
        &workspace,
        &earlier_entry,
        "test-client",
        "unskip",
    )
    .await
    .unwrap();
    let restored = journal_flow::get_trade(&pool, &user, &workspace, &earlier_entry)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(restored.review_state, "unreviewed");
}
