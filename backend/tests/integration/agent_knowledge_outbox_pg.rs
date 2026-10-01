use crate::agent_support::AgentPgFixture;

async fn insert_note(fixture: &AgentPgFixture, id: &str) {
    sqlx::query(
        "INSERT INTO notebook_notes
         (id, user_id, workspace_id, title, document_json, hlc)
         VALUES ($1, $2, $3, 'Discipline', '{}', '1')",
    )
    .bind(id)
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
}

async fn insert_playbook(fixture: &AgentPgFixture, id: &str) {
    sqlx::query(
        "INSERT INTO playbooks
         (id, user_id, workspace_id, name, edge_name, entry_rules, exit_rules,
          position_sizing_rules, hlc)
         VALUES ($1, $2, $3, 'Opening range', 'Momentum', 'wait', 'scale', 'one risk', '1')",
    )
    .bind(id)
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
}

async fn insert_trade(fixture: &AgentPgFixture, id: &str) {
    sqlx::query(
        "INSERT INTO journal_entries
         (id, user_id, workspace_id, open_date, close_date, entry_price, exit_price,
          position_size, symbol, symbol_name, status, total_pl, net_roi, duration,
          stop_loss, risk_reward, trade_type, mistakes, entry_tactics, edges_spotted, hlc)
         VALUES ($1,$2,$3,now() - interval '1 hour',now(),100,101,1,'AAPL','Apple',
                 'profit',1,1,3600,99,1,'long','','breakout','momentum','1')",
    )
    .bind(id)
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn canonical_sources_enqueue_and_coalesce_transactionally() {
    let fixture = AgentPgFixture::new().await;
    insert_note(&fixture, "note-knowledge").await;
    insert_playbook(&fixture, "playbook-knowledge").await;
    insert_trade(&fixture, "trade-knowledge").await;

    let kinds: Vec<String> = sqlx::query_scalar(
        "SELECT source_type FROM agent_index_outbox WHERE status = 'queued' ORDER BY source_type",
    )
    .fetch_all(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(kinds, ["journal_entry", "notebook_note", "playbook"]);

    sqlx::query("UPDATE notebook_notes SET title = 'Updated' WHERE id = 'note-knowledge'")
        .execute(&fixture.pool)
        .await
        .unwrap();
    let note_jobs: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_index_outbox
         WHERE source_type = 'notebook_note' AND source_id = 'note-knowledge' AND status = 'queued'",
    )
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(note_jobs, 1, "updates coalesce into the queued source work");

    sqlx::query("DELETE FROM notebook_notes WHERE id = 'note-knowledge'")
        .execute(&fixture.pool)
        .await
        .unwrap();
    let operation: String = sqlx::query_scalar(
        "SELECT operation FROM agent_index_outbox
         WHERE source_type = 'notebook_note' AND source_id = 'note-knowledge' AND status = 'queued'",
    )
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(operation, "delete");
}

#[tokio::test]
async fn rolled_back_source_change_publishes_no_index_work() {
    let fixture = AgentPgFixture::new().await;
    let mut tx = fixture.pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO notebook_notes
         (id, user_id, workspace_id, title, document_json, hlc)
         VALUES ('rolled-back-note', $1, $2, 'Nope', '{}', '1')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.rollback().await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM agent_index_outbox")
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn explicit_note_trade_link_enqueues_both_real_relationship_ends() {
    let fixture = AgentPgFixture::new().await;
    insert_note(&fixture, "linked-note").await;
    insert_trade(&fixture, "linked-trade").await;
    sqlx::query("DELETE FROM agent_index_outbox")
        .execute(&fixture.pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO notebook_note_trades (note_id, trade_id) VALUES ('linked-note', 'linked-trade')",
    )
    .execute(&fixture.pool)
    .await
    .unwrap();
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT source_type, source_id FROM agent_index_outbox ORDER BY source_type",
    )
    .fetch_all(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(
        rows,
        vec![
            ("journal_entry".into(), "linked-trade".into()),
            ("notebook_note".into(), "linked-note".into()),
        ]
    );
}
