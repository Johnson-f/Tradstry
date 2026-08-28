mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use pg_support::seed_user_workspace;
use tradstry_backend::service::agents::{AgentContextKind, context};

#[tokio::test]
async fn context_search_is_grouped_owned_and_storage_safe() {
    let fixture = AgentPgFixture::new().await;
    let (foreign_user, foreign_workspace) = seed_user_workspace(&fixture.pool).await;

    for (id, user_id, workspace_id, symbol, deleted) in [
        (
            "trade-owned",
            fixture.actor.user_id.as_str(),
            fixture.scope.workspace_id.as_str(),
            "AXP",
            false,
        ),
        (
            "trade-deleted",
            fixture.actor.user_id.as_str(),
            fixture.scope.workspace_id.as_str(),
            "AXP",
            true,
        ),
        (
            "trade-foreign",
            foreign_user.as_str(),
            foreign_workspace.as_str(),
            "AXP",
            false,
        ),
    ] {
        sqlx::query(
            "INSERT INTO journal_entries
             (id,user_id,workspace_id,open_date,close_date,entry_price,exit_price,position_size,
              symbol,symbol_name,status,total_pl,net_roi,duration,stop_loss,risk_reward,trade_type,
              mistakes,entry_tactics,edges_spotted,hlc,deleted_at)
             VALUES ($1,$2,$3,now()-interval '1 hour',now(),100,110,2,$4,'American Express',
                     'profit',10,10,1,95,2,'long','','','','v1',CASE WHEN $5 THEN now() END)",
        )
        .bind(id)
        .bind(user_id)
        .bind(workspace_id)
        .bind(symbol)
        .bind(deleted)
        .execute(&fixture.pool)
        .await
        .unwrap();
    }

    sqlx::query(
        "INSERT INTO playbooks
         (id,user_id,workspace_id,name,edge_name,entry_rules,exit_rules,position_sizing_rules)
         VALUES ('playbook-owned',$1,$2,'AXP Breakout','Momentum','enter','exit','size')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO notebook_notes (id,user_id,workspace_id,title,document_json,hlc)
         VALUES ('note-owned',$1,$2,'AXP Review','{}','v1')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO notebook_images
         (id,note_id,user_id,workspace_id,cloudinary_asset_id,cloudinary_public_id,secure_url,
          width,height,format,original_filename,media_type,content_type,content_hash)
         VALUES ('media-owned','note-owned',$1,$2,'secret-asset','secret-public',
                 'https://secret.invalid/file',100,100,'png','AXP chart.png','image','image/png','hash')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();

    let results = context::search(
        &fixture.pool,
        &fixture.actor,
        &fixture.scope.workspace_id,
        "x",
        30,
    )
    .await
    .unwrap();

    assert_eq!(
        results.iter().map(|result| result.kind).collect::<Vec<_>>(),
        [
            AgentContextKind::Trade,
            AgentContextKind::Playbook,
            AgentContextKind::Note,
            AgentContextKind::Media,
        ]
    );
    assert!(
        results
            .iter()
            .any(|result| result.key == "trade:trade-owned")
    );
    assert!(!results.iter().any(|result| result.key.contains("deleted")));
    assert!(!results.iter().any(|result| result.key.contains("foreign")));

    let serialized = serde_json::to_string(&results).unwrap();
    assert!(!serialized.contains("secret-asset"));
    assert!(!serialized.contains("secret-public"));
    assert!(!serialized.contains("secret.invalid"));
}

#[tokio::test]
async fn context_search_rejects_foreign_workspace() {
    let fixture = AgentPgFixture::new().await;
    let (_, foreign_workspace) = seed_user_workspace(&fixture.pool).await;
    let error = context::search(&fixture.pool, &fixture.actor, &foreign_workspace, "", 30)
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        tradstry_backend::service::agents::AgentError::NotFound
    ));
}
