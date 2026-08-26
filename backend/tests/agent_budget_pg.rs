mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use tradstry_backend::service::agents::{AgentBudget, AgentError};

#[tokio::test]
async fn same_run_reserves_only_once() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("budget-once").await;
    let budget = AgentBudget::new(fixture.pool.clone());
    let first = budget
        .reserve_user_action(&fixture.actor, &run.id, "chat")
        .await
        .unwrap();
    let second = budget
        .reserve_user_action(&fixture.actor, &run.id, "chat")
        .await
        .unwrap();
    assert!(first.reserved_now);
    assert!(!second.reserved_now);
    let used: i32 = sqlx::query_scalar(
        "SELECT used FROM usage_counters WHERE user_id = $1 AND metric = 'ai_actions'",
    )
    .bind(&fixture.actor.user_id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(used, 1);
}

#[tokio::test]
async fn concurrent_final_slot_allows_one_run() {
    let fixture = AgentPgFixture::new().await;
    sqlx::query("UPDATE plan_limits SET ai_actions_per_month = 1 WHERE plan = 'free'")
        .execute(&fixture.pool)
        .await
        .unwrap();
    let first = fixture.create_run("budget-first").await;
    let second = fixture.create_run("budget-second").await;
    let budget = AgentBudget::new(fixture.pool.clone());
    let (a, b) = tokio::join!(
        budget.reserve_user_action(&fixture.actor, &first.id, "chat"),
        budget.reserve_user_action(&fixture.actor, &second.id, "chat")
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(a, Err(AgentError::Capacity)) || matches!(b, Err(AgentError::Capacity)));
}

#[tokio::test]
async fn founder_plan_is_unlimited_and_does_not_write_counter() {
    let fixture = AgentPgFixture::new().await;
    sqlx::query("UPDATE users SET plan = 'founder' WHERE id = $1")
        .bind(&fixture.actor.user_id)
        .execute(&fixture.pool)
        .await
        .unwrap();
    let run = fixture.create_run("founder-budget").await;
    let permit = AgentBudget::new(fixture.pool.clone())
        .reserve_user_action(&fixture.actor, &run.id, "chat")
        .await
        .unwrap();
    assert_eq!(permit.limit, None);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM usage_counters WHERE user_id = $1")
        .bind(&fixture.actor.user_id)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
