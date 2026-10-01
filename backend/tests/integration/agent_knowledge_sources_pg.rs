use crate::agent_support::AgentPgFixture;
use tradstry_backend::service::agents::knowledge::{
    KnowledgeOutboxRecord, KnowledgeSourceType, chunking::chunk_source, sources::build_source,
};

#[tokio::test]
async fn note_relationships_come_only_from_explicit_links() {
    let fixture = AgentPgFixture::new().await;
    sqlx::query(
        "INSERT INTO notebook_notes
         (id,user_id,workspace_id,title,document_json,hlc)
         VALUES ('note-source',$1,$2,'Review',
         '{\"root\":{\"children\":[{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\",\"text\":\"Wait for confirmation\"}]}]}}','note-v1')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    for (id, symbol) in [("linked-trade", "AAPL"), ("similar-trade", "AAPL")] {
        sqlx::query(
            "INSERT INTO journal_entries
             (id,user_id,workspace_id,open_date,close_date,entry_price,exit_price,position_size,
              symbol,symbol_name,status,total_pl,net_roi,duration,stop_loss,risk_reward,trade_type,
              mistakes,entry_tactics,edges_spotted,hlc)
             VALUES ($1,$2,$3,now()-interval '1 hour',now(),1,2,1,$4,$4,'profit',1,1,1,0.5,1,
                     'long','','','','trade-v1')",
        )
        .bind(id)
        .bind(&fixture.actor.user_id)
        .bind(&fixture.scope.workspace_id)
        .bind(symbol)
        .execute(&fixture.pool)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO notebook_note_trades(note_id,trade_id) VALUES ('note-source','linked-trade')",
    )
    .execute(&fixture.pool)
    .await
    .unwrap();
    let record = KnowledgeOutboxRecord {
        id: 0,
        user_id: fixture.actor.user_id.clone(),
        workspace_id: fixture.scope.workspace_id.clone(),
        source_type: KnowledgeSourceType::NotebookNote,
        source_id: "note-source".into(),
        operation: "upsert".into(),
        status: "running".into(),
        attempt_count: 1,
    };
    let source = build_source(&fixture.pool, &record).await.unwrap().unwrap();
    assert_eq!(source.relationships.trade_ids, ["linked-trade"]);
    assert_eq!(source.relationships.symbols, ["AAPL"]);
    assert!(
        !source
            .relationships
            .trade_ids
            .contains(&"similar-trade".into())
    );
    let passages = chunk_source(&source);
    assert_eq!(passages.len(), 1);
    assert!(passages[0].search_text.contains("Wait for confirmation"));
    assert_eq!(passages[0].source_version.0, "note-v1");
}
