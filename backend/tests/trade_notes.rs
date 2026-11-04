use serde_json::Value;
use sqlx::PgPool;
use tradstry::trades::notes::{self, NoteDocument};

#[sqlx::test]
async fn notes_default_to_an_empty_document_and_only_store_documents(pool: PgPool) {
    sqlx::raw_sql(
        "INSERT INTO users (id, stytch_user_id) VALUES ('00000000-0000-0000-0000-000000000001', 'user-test-1');
         INSERT INTO workspaces (id, user_id, name) VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main');
         INSERT INTO trade_annotations (id, user_id, workspace_id, trade_id, anchor_fill_key)
         VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'trade-1', 'fill-1');",
    )
    .execute(&pool)
    .await
    .unwrap();
    let default: Value = sqlx::query_scalar("SELECT notes FROM trade_annotations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(default, NoteDocument::default().0);
    notes::validate(&default).unwrap();
    for invalid in ["\"old format\"", "{}"] {
        assert!(
            sqlx::query("UPDATE trade_annotations SET notes = $1::jsonb")
                .bind(invalid)
                .execute(&pool)
                .await
                .is_err()
        );
    }
}
