mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use tradstry_backend::service::agents::actions::execute_action;
use tradstry_backend::service::agents::{
    AgentActionChange, AgentActionPayload, AgentActionPreview, AgentConfig, AgentService,
    AgentStore, TradeTagAction,
};

fn enabled_config() -> AgentConfig {
    AgentConfig::from_lookup(|name| match name {
        "AGENTS_V2_ENABLED" => Some("true".into()),
        "AGENT_MODEL_PROVIDER" => Some("gemini".into()),
        "AGENT_FAST_MODEL" => Some("fast".into()),
        "AGENT_REASONING_MODEL" => Some("reasoning".into()),
        "AGENT_VISION_MODEL" => Some("vision".into()),
        _ => None,
    })
    .unwrap()
}

#[tokio::test]
async fn confirmed_tag_action_executes_once_through_canonical_versioned_mutation() {
    let fixture = AgentPgFixture::new().await;
    sqlx::query(
        "INSERT INTO journal_entries
         (id,user_id,workspace_id,open_date,close_date,entry_price,exit_price,position_size,
          symbol,symbol_name,status,total_pl,net_roi,duration,stop_loss,risk_reward,trade_type,
          mistakes,entry_tactics,edges_spotted,hlc)
         VALUES('action-trade',$1,$2,now()-interval '1 hour',now(),1,2,1,'AAPL','Apple',
                'profit',1,1,1,0.5,1,'long','','','','trade-v1')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tag_categories(id,user_id,workspace_id,name,created_at,updated_at)
         VALUES('action-category',$1,$2,'Setup',now(),now())",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tags(id,user_id,workspace_id,category_id,name,created_at,updated_at)
         VALUES('action-tag',$1,$2,'action-category','Breakout',now(),now())",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    let run = fixture.create_run("action-execution").await;
    let proposal = fixture
        .store
        .create_action_proposal(
            &fixture.actor,
            &run.id,
            &AgentActionPayload::AddTradeTag(TradeTagAction {
                trade_id: "action-trade".into(),
                tag_id: "action-tag".into(),
                expected_trade_version: "trade-v1".into(),
            }),
            &AgentActionPreview {
                title: "Add trade tag".into(),
                summary: "Add after confirmation".into(),
                changes: vec![AgentActionChange {
                    field: "tag".into(),
                    before: None,
                    after: "action-tag".into(),
                }],
                warnings: vec![],
            },
            15,
        )
        .await
        .unwrap();
    fixture
        .store
        .approve_action_proposal(&fixture.actor, &proposal.id, "execute-once")
        .await
        .unwrap();
    let service = AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        None,
    );
    let job = service
        .store()
        .claim_action_execution("action-worker", 120)
        .await
        .unwrap()
        .unwrap();
    execute_action(&service, &job, "action-worker")
        .await
        .unwrap();
    let linked: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM trade_tags WHERE journal_entry_id='action-trade' AND tag_id='action-tag')",
    ).fetch_one(&fixture.pool).await.unwrap();
    assert!(linked);
    let statuses: (String, String) = sqlx::query_as(
        "SELECT p.status,e.status FROM agent_action_proposals p
         JOIN agent_action_executions e ON e.proposal_id=p.id WHERE p.id=$1",
    )
    .bind(&proposal.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(statuses, ("executed".into(), "completed".into()));
    assert!(
        service
            .store()
            .claim_action_execution("another", 120)
            .await
            .unwrap()
            .is_none()
    );
    let action_messages: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_messages WHERE conversation_id=$1 AND role='action'",
    )
    .bind(&run.conversation_id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(action_messages, 1);
    let index_work: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_index_outbox WHERE source_type='journal_entry' AND source_id='action-trade' AND status='queued'",
    ).fetch_one(&fixture.pool).await.unwrap();
    assert_eq!(index_work, 1);
}
