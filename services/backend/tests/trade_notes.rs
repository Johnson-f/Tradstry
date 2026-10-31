use serde_json::Value;
use sqlx::PgPool;
use tradstry::trades::notes::{self, NoteDocument};

#[sqlx::test(migrations = false)]
async fn migration_preserves_old_text_and_only_stores_documents(pool: PgPool) {
    sqlx::raw_sql(
        "CREATE TABLE trade_annotations (id integer PRIMARY KEY, notes text NOT NULL DEFAULT '')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let cases = [
        "",
        "A plain note",
        "first\n\nlast\n",
        "Quotes: \"keep\" & <tags> 🚀",
    ];
    for (index, text) in cases.iter().enumerate() {
        sqlx::query("INSERT INTO trade_annotations VALUES ($1, $2)")
            .bind(index as i32)
            .bind(text)
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::raw_sql(include_str!("../migrations/0009_rich_trade_notes.sql"))
        .execute(&pool)
        .await
        .unwrap();
    let rows: Vec<Value> = sqlx::query_scalar("SELECT notes FROM trade_annotations ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    for (stored, original) in rows.iter().zip(cases) {
        assert_eq!(*stored, NoteDocument::from(original).0);
        notes::validate(stored).unwrap();
    }
    sqlx::query("INSERT INTO trade_annotations (id) VALUES (99)")
        .execute(&pool)
        .await
        .unwrap();
    let default: Value = sqlx::query_scalar("SELECT notes FROM trade_annotations WHERE id = 99")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(default, NoteDocument::default().0);
    assert!(
        sqlx::query("UPDATE trade_annotations SET notes = '\"old format\"'::jsonb WHERE id = 99")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("UPDATE trade_annotations SET notes = '{}'::jsonb WHERE id = 99")
            .execute(&pool)
            .await
            .is_err()
    );
}
