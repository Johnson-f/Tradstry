//! Reading and editing note bodies as Tradstry Markdown, against a real Postgres
//! and the real projector.

use crate::pg_support::{TestDb, seed_user_workspace};
use sqlx::PgPool;
use tradstry_backend::graphql::notebook::crdt as crdt_api;
use tradstry_backend::service::db::schema::tables::notebook::{
    crdt,
    notes::{self, CreateNotebookNoteInput},
};
use tradstry_backend::service::notebook::exchange::{
    self, CreateFromMarkdown, NotebookEditResult, NotebookNoteDocument,
};
use tradstry_backend::service::notebook::projector::{self, ExchangeRejection, NoteEdit, TextEdit};

const CLIENT: &str = "mcp-test";

async fn create(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    title: &str,
    markdown: &str,
) -> NotebookNoteDocument {
    exchange::create_from_markdown(
        pool,
        user,
        CreateFromMarkdown {
            workspace_id: workspace.into(),
            title: title.into(),
            markdown: markdown.into(),
            folder_id: None,
            trade_ids: Vec::new(),
            client_id: CLIENT.into(),
            mutation_id: format!("create-{title}-{markdown}"),
        },
    )
    .await
    .unwrap()
}

async fn edit(
    pool: &PgPool,
    user: &str,
    note: &str,
    change: NoteEdit,
    revision: Option<&str>,
    mutation: &str,
) -> anyhow::Result<NotebookEditResult> {
    exchange::edit_document(
        pool,
        user,
        note,
        change,
        revision.map(str::to_string),
        CLIENT,
        mutation,
    )
    .await
}

fn replace(old: &str, new: &str) -> NoteEdit {
    NoteEdit::ReplaceText {
        edits: vec![TextEdit {
            old: old.into(),
            new: new.into(),
        }],
    }
}

fn rejection(error: anyhow::Error) -> String {
    error
        .downcast_ref::<ExchangeRejection>()
        .map(|r| r.code.clone())
        .unwrap_or_else(|| panic!("expected a rejection, got {error:#}"))
}

async fn seed_trade(pool: &PgPool, user: &str, workspace: &str, id: &str, symbol: &str) {
    sqlx::query(
        "INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,total_pl,net_roi,duration,status)
         VALUES($1,$2,$3,$4,$4,'long','2026-10-03T14:00:00Z','2026-10-03T16:00:00Z',100,101,10,1,1,7200,'profit')",
    )
    .bind(id)
    .bind(user)
    .bind(workspace)
    .bind(symbol)
    .execute(pool)
    .await
    .unwrap();
}

async fn seed_image(pool: &PgPool, user: &str, hash: &str) {
    sqlx::query(
        "INSERT INTO notebook_media_blobs
         (id,user_id,content_hash,object_key,state,content_type,media_type,format,bytes,
          width,height,checksum_sha256,quota_counted)
         VALUES ($1,$2,$3,$4,'ready','image/png','image','png',100,640,480,$3,true)",
    )
    .bind(format!("blob-{hash}"))
    .bind(user)
    .bind(hash)
    .bind(format!("notebook/{user}/media/{hash}"))
    .execute(pool)
    .await
    .unwrap();
}

async fn update_count(pool: &PgPool, note: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM notebook_note_updates WHERE note_id = $1")
        .bind(note)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_note_created_from_markdown_reads_back_unfiled_with_its_title() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(
        &pool,
        &user,
        &workspace,
        "FOMC playbook",
        "- [ ] read the statement\n\n---\n\nWait.",
    )
    .await;
    assert_eq!(note.title, "FOMC playbook");
    assert_eq!(note.folder_id, None);
    assert_eq!(note.placeholders, 0);
    assert_eq!(
        note.markdown,
        "# FOMC playbook\n\n- [ ] read the statement\n\n---\n\nWait."
    );
    assert_eq!(
        crdt::note_state(&pool, &note.id).await.unwrap(),
        crdt::NoteState::Crdt
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_retried_create_returns_the_same_note() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let first = create(&pool, &user, &workspace, "Plan", "body").await;
    let again = create(&pool, &user, &workspace, "Plan", "body").await;
    assert_eq!(first.id, again.id);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM notebook_notes WHERE user_id = $1")
        .bind(&user)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_edit_changes_only_its_block_and_keeps_the_projection_fresh() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(
        &pool,
        &user,
        &workspace,
        "Log",
        "First entry.\n\nSecond entry.",
    )
    .await;
    let result = edit(
        &pool,
        &user,
        &note.id,
        replace("Second entry.", "Second entry, revised."),
        Some(&note.revision),
        "e1",
    )
    .await
    .unwrap();
    assert_eq!(result.changes.changed, 1);
    assert_eq!(result.changes.kept, 2);
    assert!(!result.replayed);
    assert_eq!(
        result.note.markdown,
        "# Log\n\nFirst entry.\n\nSecond entry, revised."
    );

    let row = notes::find_notebook_note(&pool, &note.id, &user)
        .await
        .unwrap()
        .unwrap();
    assert!(
        row.document_json.contains("Second entry, revised."),
        "projection updated in the same write"
    );
    assert!(crdt::is_projection_fresh(&pool, &note.id).await.unwrap());

    let read = exchange::read_document(&pool, &user, &note.id)
        .await
        .unwrap();
    assert_eq!(read.markdown, result.note.markdown);
    assert_eq!(read.revision, result.note.revision);

    let renamed = edit(
        &pool,
        &user,
        &note.id,
        NoteEdit::SetTitle {
            title: "Trading log".into(),
        },
        Some(&read.revision),
        "e2",
    )
    .await
    .unwrap();
    assert_eq!(renamed.note.title, "Trading log");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_stale_revision_is_a_conflict() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(&pool, &user, &workspace, "Log", "one").await;
    edit(
        &pool,
        &user,
        &note.id,
        NoteEdit::Append {
            markdown: "two".into(),
        },
        None,
        "a1",
    )
    .await
    .unwrap();
    let error = edit(
        &pool,
        &user,
        &note.id,
        replace("one", "uno"),
        Some(&note.revision),
        "r1",
    )
    .await
    .unwrap_err();
    assert_eq!(rejection(error), "CONFLICT");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_replayed_edit_is_applied_once_and_a_reused_identity_is_refused() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(&pool, &user, &workspace, "Log", "one").await;
    let change = || NoteEdit::Append {
        markdown: "two".into(),
    };
    let first = edit(&pool, &user, &note.id, change(), None, "same")
        .await
        .unwrap();
    let updates = update_count(&pool, &note.id).await;
    let again = edit(&pool, &user, &note.id, change(), None, "same")
        .await
        .unwrap();
    assert!(again.replayed);
    assert_eq!(again.changes.inserted, first.changes.inserted);
    assert_eq!(update_count(&pool, &note.id).await, updates);
    assert_eq!(again.note.markdown, "# Log\n\none\n\ntwo");

    let error = edit(
        &pool,
        &user,
        &note.id,
        NoteEdit::Append {
            markdown: "three".into(),
        },
        None,
        "same",
    )
    .await
    .unwrap_err();
    assert!(format!("{error:#}").contains("IDEMPOTENCY_CONFLICT"));
}

#[tokio::test(flavor = "multi_thread")]
async fn another_users_note_cannot_be_read_or_edited() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (owner, workspace) = seed_user_workspace(&pool).await;
    let (intruder, _) = seed_user_workspace(&pool).await;

    let note = create(&pool, &owner, &workspace, "Private", "secret").await;
    let read = exchange::read_document(&pool, &intruder, &note.id)
        .await
        .unwrap_err();
    assert_eq!(rejection(read), "NOT_FOUND");
    let write = edit(
        &pool,
        &intruder,
        &note.id,
        NoteEdit::Append {
            markdown: "x".into(),
        },
        None,
        "x",
    )
    .await
    .unwrap_err();
    assert_eq!(rejection(write), "NOT_FOUND");
}

#[tokio::test(flavor = "multi_thread")]
async fn references_must_be_the_users_and_chips_link_their_trades() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    let (other, other_workspace) = seed_user_workspace(&pool).await;
    seed_trade(&pool, &user, &workspace, "trade-mine", "AAPL").await;
    seed_trade(&pool, &other, &other_workspace, "trade-theirs", "MSFT").await;
    let mine = "a".repeat(64);
    let theirs = "b".repeat(64);
    seed_image(&pool, &user, &mine).await;
    seed_image(&pool, &other, &theirs).await;

    let note = create(&pool, &user, &workspace, "Review", "start").await;
    for (markdown, mutation) in [
        (format!("![x](media:{theirs})"), "m1"),
        ("[x](trade:trade-theirs)".to_string(), "m2"),
        ("[x](trade:no-such-trade)".to_string(), "m3"),
    ] {
        let error = edit(
            &pool,
            &user,
            &note.id,
            NoteEdit::Append { markdown },
            None,
            mutation,
        )
        .await
        .unwrap_err();
        assert_eq!(rejection(error), "INVALID_REFERENCE");
    }

    let result = edit(
        &pool,
        &user,
        &note.id,
        NoteEdit::Append {
            markdown: format!(
                "Entry [x](trade:trade-mine) looked like this:\n\n![chart](media:{mine})"
            ),
        },
        None,
        "ok",
    )
    .await
    .unwrap();
    assert!(
        result
            .note
            .markdown
            .contains("[AAPL · 2026-10-03](trade:trade-mine)"),
        "{}",
        result.note.markdown
    );
    assert_eq!(result.note.linked_trades.len(), 1);
    assert_eq!(result.note.linked_trades[0].label, "AAPL · 2026-10-03");
    let attached: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE note_id = $1")
            .bind(&note.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(attached, 1, "the image is referenced by the note");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_note_no_client_has_opened_is_seeded_when_read() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let document_json = projector::markdown_to_json("# Old note\n\nWritten before CRDT.")
        .await
        .unwrap();
    let note = notes::create_notebook_note(
        &pool,
        &user,
        CreateNotebookNoteInput {
            id: None,
            workspace_id: workspace.clone(),
            document_json,
            trade_ids: Vec::new(),
            folder_id: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        crdt::note_state(&pool, &note.id).await.unwrap(),
        crdt::NoteState::Legacy
    );

    let read = exchange::read_document(&pool, &user, &note.id)
        .await
        .unwrap();
    assert_eq!(read.markdown, "# Old note\n\nWritten before CRDT.");
    assert_eq!(
        crdt::note_state(&pool, &note.id).await.unwrap(),
        crdt::NoteState::Crdt
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_note_stuck_seeding_asks_the_caller_to_retry() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(&pool, &user, &workspace, "Busy", "x").await;
    sqlx::query("UPDATE notebook_note_crdt SET state = 'seeding' WHERE note_id = $1")
        .bind(&note.id)
        .execute(&pool)
        .await
        .unwrap();
    let error = edit(
        &pool,
        &user,
        &note.id,
        NoteEdit::Append {
            markdown: "y".into(),
        },
        None,
        "s",
    )
    .await
    .unwrap_err();
    assert_eq!(rejection(error), "RETRY");
}

#[tokio::test(flavor = "multi_thread")]
async fn compaction_between_read_and_edit_is_not_a_conflict() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(&pool, &user, &workspace, "Log", "one").await;
    for i in 0..3 {
        edit(
            &pool,
            &user,
            &note.id,
            NoteEdit::Append {
                markdown: format!("line {i}"),
            },
            None,
            &format!("a{i}"),
        )
        .await
        .unwrap();
    }
    let read = exchange::read_document(&pool, &user, &note.id)
        .await
        .unwrap();

    let chain: Vec<Vec<u8>> = crdt_api::updates_since(&pool, &user, &note.id, 0)
        .await
        .unwrap()
        .into_iter()
        .map(|(_, update)| update)
        .collect();
    let merged = projector::compact(&chain).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("DELETE FROM notebook_note_updates WHERE note_id = $1")
        .bind(&note.id)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("INSERT INTO notebook_note_updates (note_id, update) VALUES ($1, $2)")
        .bind(&note.id)
        .bind(&merged)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let result = edit(
        &pool,
        &user,
        &note.id,
        replace("line 1", "line one"),
        Some(&read.revision),
        "after-compaction",
    )
    .await
    .unwrap();
    assert_eq!(result.changes.changed, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_append_racing_an_edit_is_never_lost() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;

    let note = create(&pool, &user, &workspace, "Race", "alpha\n\nbeta").await;
    let chain: Vec<Vec<u8>> = crdt_api::updates_since(&pool, &user, &note.id, 0)
        .await
        .unwrap()
        .into_iter()
        .map(|(_, update)| update)
        .collect();
    let from_device = projector::edit_note(
        &chain,
        &NoteEdit::ReplaceText {
            edits: vec![TextEdit {
                old: "alpha".into(),
                new: "alpha from the web".into(),
            }],
        },
        None,
        &Default::default(),
    )
    .await
    .unwrap()
    .update
    .unwrap();

    let device = {
        let pool = pool.clone();
        let (user, id) = (user.clone(), note.id.clone());
        tokio::spawn(
            async move { crdt_api::append_updates(&pool, &user, &id, &[from_device]).await },
        )
    };
    edit(
        &pool,
        &user,
        &note.id,
        replace("beta", "beta from chat"),
        None,
        "race",
    )
    .await
    .unwrap();
    device.await.unwrap().unwrap();

    let read = exchange::read_document(&pool, &user, &note.id)
        .await
        .unwrap();
    assert_eq!(
        read.markdown,
        "# Race\n\nalpha from the web\n\nbeta from chat"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn removing_a_trade_chip_unlinks_its_trade_but_not_one_linked_without_a_chip() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    seed_trade(&pool, &user, &workspace, "chipped", "AAPL").await;
    seed_trade(&pool, &user, &workspace, "plain", "MSFT").await;

    let note = exchange::create_from_markdown(
        &pool,
        &user,
        CreateFromMarkdown {
            workspace_id: workspace.clone(),
            title: "Review".into(),
            markdown: "Entry [x](trade:chipped) was early.".into(),
            folder_id: None,
            trade_ids: vec!["plain".into()],
            client_id: CLIENT.into(),
            mutation_id: "chips".into(),
        },
    )
    .await
    .unwrap();
    let mut linked: Vec<String> = note.linked_trades.iter().map(|t| t.id.clone()).collect();
    linked.sort();
    assert_eq!(linked, vec!["chipped", "plain"]);

    let read = exchange::read_document(&pool, &user, &note.id)
        .await
        .unwrap();
    let chip = "[AAPL · 2026-10-03](trade:chipped)";
    assert!(read.markdown.contains(chip), "{}", read.markdown);
    let result = edit(
        &pool,
        &user,
        &note.id,
        replace(&format!("Entry {chip} was early."), "Entry was early."),
        Some(&read.revision),
        "unchip",
    )
    .await
    .unwrap();
    let linked: Vec<&str> = result
        .note
        .linked_trades
        .iter()
        .map(|t| t.id.as_str())
        .collect();
    assert_eq!(
        linked,
        vec!["plain"],
        "the chip's trade is unlinked; the plain link stays"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn the_sweep_converts_notes_no_one_has_opened() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    let document_json = projector::markdown_to_json("# Old\n\nbody").await.unwrap();
    let note = notes::create_notebook_note(
        &pool,
        &user,
        CreateNotebookNoteInput {
            id: None,
            workspace_id: workspace,
            document_json,
            trade_ids: Vec::new(),
            folder_id: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        crdt::note_state(&pool, &note.id).await.unwrap(),
        crdt::NoteState::Legacy
    );

    assert_eq!(crdt::sweep_legacy_notes(&pool, 50).await.unwrap(), 1);
    assert_eq!(
        crdt::note_state(&pool, &note.id).await.unwrap(),
        crdt::NoteState::Crdt
    );
    assert_eq!(
        crdt::sweep_legacy_notes(&pool, 50).await.unwrap(),
        0,
        "nothing left to convert"
    );
}
