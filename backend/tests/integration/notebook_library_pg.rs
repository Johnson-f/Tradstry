//! Listing, organising, restoring and purging notes.

use crate::pg_support::{TestDb, seed_user_workspace};
use sqlx::PgPool;
use tradstry_backend::service::db::schema::tables::notebook::{
    folders::{self, CreateNotebookFolderInput},
    notes,
};
use tradstry_backend::service::notebook::exchange::{self, CreateFromMarkdown};
use tradstry_backend::service::notebook::library::{self, NotebookNoteFilter};

async fn note(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    title: &str,
    body: &str,
    folder: Option<&str>,
) -> String {
    exchange::create_from_markdown(
        pool,
        user,
        CreateFromMarkdown {
            workspace_id: workspace.into(),
            title: title.into(),
            markdown: body.into(),
            folder_id: folder.map(str::to_string),
            trade_ids: Vec::new(),
            client_id: "test".into(),
            mutation_id: format!("{title}-{body}"),
        },
    )
    .await
    .unwrap()
    .id
}

async fn folder(pool: &PgPool, user: &str, workspace: &str, name: &str) -> String {
    folders::create_notebook_folder(
        pool,
        CreateNotebookFolderInput {
            id: None,
            user_id: user.into(),
            workspace_id: workspace.into(),
            parent_folder_id: None,
            name: name.into(),
        },
    )
    .await
    .unwrap()
    .id
}

async fn seed_trade(pool: &PgPool, user: &str, workspace: &str, id: &str) {
    sqlx::query(
        "INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,total_pl,net_roi,duration,status)
         VALUES($1,$2,$3,'AAPL','AAPL','long','2026-10-03T14:00:00Z','2026-10-03T16:00:00Z',100,101,10,1,1,7200,'profit')",
    )
    .bind(id)
    .bind(user)
    .bind(workspace)
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

async fn references(pool: &PgPool, note: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE note_id = $1")
        .bind(note)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn summaries_filter_page_and_put_pinned_notes_first() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    seed_trade(&pool, &user, &workspace, "trade-1").await;
    let macro_folder = folder(&pool, &user, &workspace, "Macro").await;

    let a = note(&pool, &user, &workspace, "A", "first body", None).await;
    let b = note(
        &pool,
        &user,
        &workspace,
        "B",
        "second body",
        Some(&macro_folder),
    )
    .await;
    let c = note(&pool, &user, &workspace, "C", "third body", None).await;
    notes::set_notebook_note_flags(&pool, &a, &user, Some(true), Some(true))
        .await
        .unwrap();
    library::link_trades(&pool, &user, &c, &["trade-1".into()], &[])
        .await
        .unwrap();

    let all = library::note_summaries(
        &pool,
        &user,
        &workspace,
        NotebookNoteFilter::default(),
        None,
        None,
    )
    .await
    .unwrap();
    let ids: Vec<&str> = all.notes.iter().map(|n| n.id.as_str()).collect();
    assert_eq!(ids[0], a, "pinned first");
    assert_eq!(ids.len(), 3);
    assert_eq!(all.notes[0].preview, "first body");
    assert!(all.next_cursor.is_none());

    let filtered = |filter: NotebookNoteFilter| {
        let (pool, user, workspace) = (pool.clone(), user.clone(), workspace.clone());
        async move {
            library::note_summaries(&pool, &user, &workspace, filter, None, None)
                .await
                .unwrap()
                .notes
                .into_iter()
                .map(|n| n.id)
                .collect::<Vec<_>>()
        }
    };
    assert_eq!(
        filtered(NotebookNoteFilter {
            folder_id: Some(macro_folder.clone()),
            ..Default::default()
        })
        .await,
        vec![b.clone()]
    );
    assert_eq!(
        filtered(NotebookNoteFilter {
            unfiled: true,
            ..Default::default()
        })
        .await
        .len(),
        2
    );
    assert_eq!(
        filtered(NotebookNoteFilter {
            starred: Some(true),
            ..Default::default()
        })
        .await,
        vec![a.clone()]
    );
    assert_eq!(
        filtered(NotebookNoteFilter {
            trade_id: Some("trade-1".into()),
            ..Default::default()
        })
        .await,
        vec![c.clone()]
    );

    let first = library::note_summaries(
        &pool,
        &user,
        &workspace,
        NotebookNoteFilter::default(),
        Some(2),
        None,
    )
    .await
    .unwrap();
    assert_eq!(first.notes.len(), 2);
    let rest = library::note_summaries(
        &pool,
        &user,
        &workspace,
        NotebookNoteFilter::default(),
        Some(2),
        first.next_cursor.as_deref(),
    )
    .await
    .unwrap();
    assert_eq!(rest.notes.len(), 1);
    assert!(rest.next_cursor.is_none());
    let mut paged: Vec<String> = first
        .notes
        .into_iter()
        .chain(rest.notes)
        .map(|n| n.id)
        .collect();
    paged.sort();
    let mut expected = vec![a, b, c];
    expected.sort();
    assert_eq!(paged, expected);

    let counts = library::folder_note_counts(&pool, &user, &workspace)
        .await
        .unwrap();
    let count_of = |id: Option<&str>| {
        counts
            .iter()
            .find(|c| c.folder_id.as_deref() == id)
            .map(|c| c.note_count)
    };
    assert_eq!(count_of(None), Some(2));
    assert_eq!(count_of(Some(&macro_folder)), Some(1));
}

#[tokio::test(flavor = "multi_thread")]
async fn trade_links_are_validated_and_a_trade_notes_own_trade_stays_linked() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    let (other, other_workspace) = seed_user_workspace(&pool).await;
    seed_trade(&pool, &user, &workspace, "mine").await;
    seed_trade(&pool, &other, &other_workspace, "theirs").await;

    let id = note(&pool, &user, &workspace, "Review", "x", None).await;
    let error = library::link_trades(&pool, &user, &id, &["theirs".into()], &[])
        .await
        .unwrap_err();
    assert!(error.to_string().starts_with("INVALID_REFERENCE"));

    assert_eq!(
        library::link_trades(&pool, &user, &id, &["mine".into()], &[])
            .await
            .unwrap(),
        vec!["mine"]
    );
    sqlx::query("INSERT INTO journal_trade_context(user_id,workspace_id,entry_id,companion_note_id) VALUES ($1,$2,'mine',$3)")
        .bind(&user)
        .bind(&workspace)
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        library::link_trades(&pool, &user, &id, &[], &["mine".into()])
            .await
            .unwrap(),
        vec!["mine"]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_deleted_note_keeps_its_media_and_restores_unfiled_when_its_folder_is_gone() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    let hash = "c".repeat(64);
    seed_image(&pool, &user, &hash).await;
    let archive = folder(&pool, &user, &workspace, "Archive").await;

    let id = note(
        &pool,
        &user,
        &workspace,
        "Chart",
        &format!("![chart](media:{hash})"),
        Some(&archive),
    )
    .await;
    assert_eq!(references(&pool, &id).await, 1);

    assert!(
        notes::delete_notebook_note(&pool, &id, &user)
            .await
            .unwrap()
    );
    assert_eq!(
        references(&pool, &id).await,
        1,
        "media stays attached while the note can be restored"
    );
    folders::delete_notebook_folder_subtree(&pool, &archive, &user)
        .await
        .unwrap();

    let deleted = library::deleted_notes(&pool, &user, &workspace, None, None)
        .await
        .unwrap();
    assert_eq!(deleted.notes.len(), 1);
    assert_eq!(deleted.notes[0].id, id);

    library::restore_note(&pool, &user, &id).await.unwrap();
    let restored = notes::find_notebook_note(&pool, &id, &user)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        restored.folder_id, None,
        "its folder was deleted, so it comes back unfiled"
    );
    assert_eq!(restored.images.len(), 1);
    let read = exchange::read_document(&pool, &user, &id).await.unwrap();
    assert!(read.markdown.contains(&format!("media:{hash}")));

    let again = library::restore_note(&pool, &user, &id).await.unwrap_err();
    assert!(again.to_string().starts_with("NOT_FOUND"));
}

#[tokio::test(flavor = "multi_thread")]
async fn notes_past_the_restore_window_are_purged_and_release_their_media() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    let hash = "d".repeat(64);
    seed_image(&pool, &user, &hash).await;

    let old = note(
        &pool,
        &user,
        &workspace,
        "Old",
        &format!("![chart](media:{hash})"),
        None,
    )
    .await;
    let recent = note(&pool, &user, &workspace, "Recent", "kept", None).await;
    notes::delete_notebook_note(&pool, &old, &user)
        .await
        .unwrap();
    notes::delete_notebook_note(&pool, &recent, &user)
        .await
        .unwrap();
    sqlx::query("UPDATE notebook_notes SET deleted_at = now() - interval '31 days' WHERE id = $1")
        .bind(&old)
        .execute(&pool)
        .await
        .unwrap();

    assert!(
        library::restore_note(&pool, &user, &old).await.is_err(),
        "past the window"
    );
    assert_eq!(library::purge_deleted_notes(&pool, 100).await.unwrap(), 1);

    let remaining: Vec<String> =
        sqlx::query_scalar("SELECT id FROM notebook_notes WHERE user_id = $1")
            .bind(&user)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, vec![recent]);
    let state: String =
        sqlx::query_scalar("SELECT state FROM notebook_media_blobs WHERE content_hash = $1")
            .bind(&hash)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        state, "gc_pending",
        "the purged note's image enters the usual collection grace"
    );
}

mod search {
    use std::sync::Arc;

    use async_trait::async_trait;
    use tradstry_backend::service::agents::knowledge::{
        EmbeddingProvider, KnowledgeCandidate, KnowledgeSearchRequest, KnowledgeService,
        KnowledgeSourceType, Reranker, gather_candidates,
    };
    use tradstry_backend::service::agents::{AgentError, AgentResult};
    use tradstry_backend::service::notebook::library;

    use crate::agent_support::AgentPgFixture;

    struct KeywordsOnly;

    #[async_trait]
    impl EmbeddingProvider for KeywordsOnly {
        fn model_id(&self) -> &str {
            "test"
        }
        fn dimensions(&self) -> usize {
            2048
        }
        async fn embed_documents(&self, _inputs: &[String]) -> AgentResult<Vec<Vec<f32>>> {
            Err(AgentError::ProviderUnavailable)
        }
        async fn embed_query(&self, _input: &str) -> AgentResult<Vec<f32>> {
            Err(AgentError::ProviderUnavailable)
        }
    }

    struct InOrder;

    #[async_trait]
    impl Reranker for InOrder {
        async fn rerank(
            &self,
            _query: &str,
            candidates: &[KnowledgeCandidate],
            take: usize,
        ) -> AgentResult<Vec<usize>> {
            Ok((0..take.min(candidates.len())).collect())
        }
    }

    async fn passage(
        pool: &sqlx::PgPool,
        user: &str,
        workspace: &str,
        kind: &str,
        source: &str,
        text: &str,
    ) {
        sqlx::query(
            "INSERT INTO agent_knowledge_passages
             (id,user_id,workspace_id,source_type,source_id,source_version,chunk_index,title,
              excerpt,search_text,trade_ids,playbook_ids,note_ids,symbols,content_hash)
             VALUES ($1,$2,$3,$4,$5,'v1',0,$5,$6,$6,'{}','{}','{}','{}',$1)",
        )
        .bind(format!("passage-{source}"))
        .bind(user)
        .bind(workspace)
        .bind(kind)
        .bind(source)
        .bind(text)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn note(pool: &sqlx::PgPool, user: &str, workspace: &str, id: &str, deleted: bool) {
        sqlx::query(
            "INSERT INTO notebook_notes(id,user_id,workspace_id,title,document_json,hlc,deleted_at)
             VALUES ($1,$2,$3,'Gap fills','{}','v1',CASE WHEN $4 THEN now() END)",
        )
        .bind(id)
        .bind(user)
        .bind(workspace)
        .bind(deleted)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn search_finds_live_notes_by_their_content_and_nothing_else() {
        let fixture = AgentPgFixture::new().await;
        let (pool, user, workspace) = (
            &fixture.pool,
            &fixture.actor.user_id,
            &fixture.scope.workspace_id,
        );
        note(pool, user, workspace, "live", false).await;
        note(pool, user, workspace, "gone", true).await;
        passage(
            pool,
            user,
            workspace,
            "notebook_note",
            "live",
            "gap fills work best before ten",
        )
        .await;
        passage(
            pool,
            user,
            workspace,
            "notebook_note",
            "gone",
            "gap fills I deleted",
        )
        .await;
        passage(
            pool,
            user,
            workspace,
            "journal_entry",
            "trade-1",
            "gap fills on this trade",
        )
        .await;

        let candidates = gather_candidates(
            pool,
            user,
            &KnowledgeSearchRequest {
                workspace_id: workspace.clone(),
                query: "gap fills".into(),
                source_types: vec![KnowledgeSourceType::NotebookNote],
                limit: 10,
                ..Default::default()
            },
            None,
        )
        .await
        .unwrap();
        assert!(
            candidates
                .iter()
                .all(|c| c.source_type == KnowledgeSourceType::NotebookNote)
        );

        let knowledge =
            KnowledgeService::new(pool.clone(), Arc::new(KeywordsOnly), Arc::new(InOrder)).unwrap();
        let hits = library::search_notes(
            pool,
            &knowledge,
            &fixture.actor,
            workspace,
            "gap fills",
            None,
        )
        .await
        .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].note_id, "live");
        assert!(hits[0].excerpt.contains("before ten"));
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn deleting_a_note_frees_its_media_quota_at_once_and_restore_still_works() {
    use tradstry_backend::service::notebook::media::{
        MediaLifecycleError, ReserveMediaUploadInput, reserve_upload,
    };

    let db = TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = seed_user_workspace(&pool).await;
    let hash = "e".repeat(64);
    seed_image(&pool, &user, &hash).await;
    sqlx::query("UPDATE users SET plan='free', media_bytes_used=100 WHERE id=$1")
        .bind(&user)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM founder_grants WHERE user_id=$1")
        .bind(&user)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE plan_limits SET media_bytes=150 WHERE plan='free'")
        .execute(&pool)
        .await
        .unwrap();

    let chart = note(
        &pool,
        &user,
        &workspace,
        "Chart",
        &format!("![chart](media:{hash})"),
        None,
    )
    .await;
    let other = note(&pool, &user, &workspace, "Other", "x", None).await;
    let upload = |key: &str| ReserveMediaUploadInput {
        note_id: other.clone(),
        content_hash: format!("{key:0>64}"),
        expected_bytes: 100,
        content_type: "image/png".into(),
        original_filename: "new.png".into(),
        idempotency_key: key.into(),
    };

    let refused = reserve_upload(&pool, &user, upload("1")).await.unwrap_err();
    assert!(
        matches!(refused, MediaLifecycleError::QuotaExceeded),
        "100 used + 100 new is over 150"
    );

    notes::delete_notebook_note(&pool, &chart, &user)
        .await
        .unwrap();
    reserve_upload(&pool, &user, upload("2"))
        .await
        .expect("the deleted note's image no longer counts against the quota");

    library::restore_note(&pool, &user, &chart).await.unwrap();
    let restored = notes::find_notebook_note(&pool, &chart, &user)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        restored.images.len(),
        1,
        "the image is still there after restore"
    );
}
