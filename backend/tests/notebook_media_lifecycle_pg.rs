use std::str::FromStr;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Executor, PgPool};
use tradstry_backend::service::db::schema::tables::notebook::folders;
use tradstry_backend::service::db::schema::tables::notebook::notes;
use tradstry_backend::service::notebook::media::{
    FinalizeMediaInput, MediaLifecycleError, ReserveMediaUploadInput, finalize_upload,
    remove_note_references_tx, remove_reference, reserve_upload,
};

fn test_url() -> String {
    std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://tradstry:tradstry@localhost:5435/tradstry_test".to_string())
}

async fn isolated_pool() -> (PgPool, PgPool, String) {
    let options = PgConnectOptions::from_str(&test_url())
        .expect("parse test database URL")
        .disable_statement_logging();
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .expect("connect admin pool");
    let schema = format!(
        "media_test_{}",
        tradstry_backend::ids::new_uuid_v7().simple()
    );
    admin
        .execute(sqlx::AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
        .await
        .expect("create isolated schema");
    let search_path = format!("\"{schema}\", public");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(move |connection, _| {
            let search_path = search_path.clone();
            Box::pin(async move {
                connection
                    .execute(sqlx::AssertSqlSafe(format!(
                        "SET search_path TO {search_path}"
                    )))
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .expect("connect isolated pool");
    (admin, pool, schema)
}

async fn cleanup(admin: PgPool, pool: PgPool, schema: &str) {
    pool.close().await;
    admin
        .execute(sqlx::AssertSqlSafe(format!(
            "DROP SCHEMA \"{schema}\" CASCADE"
        )))
        .await
        .expect("drop isolated schema");
    admin.close().await;
}

async fn migrate(pool: &PgPool, schema: &str) {
    tradstry_backend::service::db::schema::bootstrap(pool, schema)
        .await
        .expect("bootstrap current schema");
}

async fn seed_user_workspace(pool: &PgPool) -> (String, String) {
    let user_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let workspace_id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query("INSERT INTO users(id,clerk_uuid,email,full_name) VALUES($1,$2,$3,$4)")
        .bind(&user_id)
        .bind(tradstry_backend::ids::new_uuid_v7().to_string())
        .bind(format!("{user_id}@test.local"))
        .bind("Test User")
        .execute(pool)
        .await
        .expect("seed user");
    sqlx::query("INSERT INTO workspaces(id,user_id,name) VALUES($1,$2,'Main')")
        .bind(&workspace_id)
        .bind(&user_id)
        .execute(pool)
        .await
        .expect("seed workspace");
    (user_id, workspace_id)
}

async fn seed_note(pool: &sqlx::PgPool, user_id: &str, workspace_id: &str) -> String {
    let id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query(
        "INSERT INTO notebook_notes(id,user_id,workspace_id,title,document_json)
         VALUES($1,$2,$3,'Media','{\"root\":{\"children\":[]}}')",
    )
    .bind(&id)
    .bind(user_id)
    .bind(workspace_id)
    .execute(pool)
    .await
    .expect("seed note");
    id
}

fn input(note_id: &str, key: &str) -> ReserveMediaUploadInput {
    ReserveMediaUploadInput {
        note_id: note_id.to_string(),
        idempotency_key: key.to_string(),
        content_hash: "a".repeat(64),
        expected_bytes: 100,
        content_type: "image/png".to_string(),
        original_filename: "chart.png".to_string(),
    }
}

#[tokio::test]
async fn concurrent_shared_hash_reserves_once_and_gc_waits_for_last_reference() {
    let (admin, pool, schema) = isolated_pool().await;
    migrate(&pool, &schema).await;
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    let first_note = seed_note(&pool, &user_id, &workspace_id).await;
    let second_note = seed_note(&pool, &user_id, &workspace_id).await;

    let (first, second) = tokio::join!(
        reserve_upload(&pool, &user_id, input(&first_note, "upload-1")),
        reserve_upload(&pool, &user_id, input(&second_note, "upload-2")),
    );
    let first = first.expect("reserve first note");
    let second = second.expect("reserve second note");
    assert_eq!(first.blob_id, second.blob_id);

    let counts: (i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM notebook_media_blobs WHERE user_id=$1),
            (SELECT count(*) FROM notebook_media_references WHERE user_id=$1),
            (SELECT media_bytes_reserved FROM users WHERE id=$1)",
    )
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(counts, (1, 2, 100));

    finalize_upload(
        &pool,
        &user_id,
        &first.upload_id,
        FinalizeMediaInput {
            etag: Some("etag".into()),
            width: 10,
            height: 10,
            duration_seconds: 0.0,
            format: "png".into(),
            content_type: "image/png".into(),
        },
    )
    .await
    .expect("finalize shared blob");

    remove_reference(&pool, &user_id, &first_note, &"a".repeat(64))
        .await
        .expect("remove first reference");
    let state: String = sqlx::query_scalar("SELECT state FROM notebook_media_blobs WHERE id=$1")
        .bind(&first.blob_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(state, "ready");

    remove_reference(&pool, &user_id, &second_note, &"a".repeat(64))
        .await
        .expect("remove last reference");
    let pending: (String, bool, i64) = sqlx::query_as(
        "SELECT state,delete_after >= now() + interval '23 hours',
                (SELECT count(*) FROM notebook_media_outbox
                 WHERE blob_id=$1 AND action='delete' AND completed_at IS NULL)
         FROM notebook_media_blobs WHERE id=$1",
    )
    .bind(&first.blob_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(pending, ("gc_pending".into(), true, 1));
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn quota_rejection_does_not_create_media_state() {
    let (admin, pool, schema) = isolated_pool().await;
    migrate(&pool, &schema).await;
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    let note_id = seed_note(&pool, &user_id, &workspace_id).await;
    sqlx::query("UPDATE users SET plan='free' WHERE id=$1")
        .bind(&user_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM founder_grants WHERE user_id=$1")
        .bind(&user_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE plan_limits SET media_bytes=50 WHERE plan='free'")
        .execute(&pool)
        .await
        .unwrap();
    let entitlement: (String, i64, Option<i64>) = sqlx::query_as(
        "SELECT u.plan,
                (SELECT count(*) FROM founder_grants WHERE user_id=u.id AND revoked_at IS NULL),
                pl.media_bytes
         FROM users u LEFT JOIN plan_limits pl ON pl.plan=u.plan WHERE u.id=$1",
    )
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(entitlement, ("free".into(), 0, Some(50)));

    let error = reserve_upload(&pool, &user_id, input(&note_id, "too-large"))
        .await
        .expect_err("quota must reject the upload");
    assert!(matches!(error, MediaLifecycleError::QuotaExceeded));
    let counts: (i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM notebook_media_blobs WHERE user_id=$1),
            (SELECT count(*) FROM notebook_media_uploads WHERE user_id=$1)",
    )
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(counts, (0, 0));
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn deleting_a_note_with_media_schedules_the_blob_for_gc() {
    let (admin, pool, schema) = isolated_pool().await;
    migrate(&pool, &schema).await;
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    let note_id = seed_note(&pool, &user_id, &workspace_id).await;
    let reservation = reserve_upload(&pool, &user_id, input(&note_id, "delete-note-media"))
        .await
        .expect("reserve note media");
    finalize_upload(
        &pool,
        &user_id,
        &reservation.upload_id,
        FinalizeMediaInput {
            etag: Some("etag".into()),
            width: 10,
            height: 10,
            duration_seconds: 0.0,
            format: "png".into(),
            content_type: "image/png".into(),
        },
    )
    .await
    .expect("finalize note media");

    let mut tx = pool.begin().await.unwrap();
    assert!(
        notes::delete_notebook_note_tx(&mut tx, &note_id, &user_id, "delete-note-media")
            .await
            .unwrap()
    );
    remove_note_references_tx(&mut tx, &user_id, std::slice::from_ref(&note_id))
        .await
        .expect("remove deleted note media references");
    tx.commit().await.unwrap();

    let state: (String, i64) = sqlx::query_as(
        "SELECT blob.state,
                (SELECT count(*) FROM notebook_media_references WHERE blob_id=blob.id)
         FROM notebook_media_blobs blob WHERE blob.id=$1",
    )
    .bind(&reservation.blob_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(state, ("gc_pending".into(), 0));
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn foreign_user_cannot_delete_a_notebook_folder() {
    let (admin, pool, schema) = isolated_pool().await;
    migrate(&pool, &schema).await;
    let (owner_id, workspace_id) = seed_user_workspace(&pool).await;
    let (attacker_id, _) = seed_user_workspace(&pool).await;
    let folder = folders::create_notebook_folder(
        &pool,
        folders::CreateNotebookFolderInput {
            id: None,
            user_id: owner_id,
            workspace_id,
            parent_folder_id: None,
            name: "Private".into(),
        },
    )
    .await
    .unwrap();

    assert!(
        folders::delete_notebook_folder_subtree(&pool, &folder.id, &attacker_id)
            .await
            .is_err()
    );
    assert!(
        sqlx::query_scalar::<_, bool>(
            "SELECT deleted_at IS NULL FROM notebook_folders WHERE id=$1"
        )
        .bind(&folder.id)
        .fetch_one(&pool)
        .await
        .unwrap()
    );
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn migrated_hashless_media_survives_edits_until_explicit_note_deletion() -> anyhow::Result<()>
{
    use anyhow::ensure;
    use async_graphql::{Request, Schema, Variables};
    use clerk_rs::validators::authorizer::ClerkJwt;
    use serde_json::json;
    use sqlx::migrate::Migrator;
    use std::{path::PathBuf, sync::Arc};
    use tradstry_backend::{
        graphql::{Mutation, Query, Subscription},
        service::db::Db,
    };

    let (admin, pool, schema) = isolated_pool().await;
    let result = async {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("schema/archive/sqlx");
        let migrations = Migrator::new(path.as_path()).await?;
        Migrator::with_migrations(migrations.iter().filter(|m| m.version <= 52).cloned().collect())
            .run(&pool).await?;
        let (user, workspace) = seed_user_workspace(&pool).await;
        let (other_user, _) = seed_user_workspace(&pool).await;
        let note = seed_note(&pool, &user, &workspace).await;
        let hash = "b".repeat(64);
        for (id, content_hash) in [("legacy", ""), ("hashed", hash.as_str())] {
            sqlx::query("INSERT INTO notebook_images(id,note_id,user_id,workspace_id,cloudinary_asset_id,cloudinary_public_id,secure_url,width,height,format,bytes,original_filename,media_type,content_type,content_hash) VALUES($1,$2,$3,$4,$1,$5,'',10,10,'png',100,'fixture.png','image','image/png',$6)")
                .bind(id).bind(&note).bind(&user).bind(&workspace)
                .bind(format!("synthetic-only/{id}")).bind(content_hash).execute(&pool).await?;
        }
        // Exercise the production upgrade path before editing the migrated note.
        migrate(&pool, &schema).await;
        let document = json!({"root":{"children":[
            {"type":"notebook-image","hash":hash,"version":1},
            {"type":"notebook-image","src":"https://example.invalid/legacy.png","version":1},
            {"type":"paragraph","children":[{"type":"text","text":"Edited text"}]}
        ]}}).to_string();
        notes::update_notebook_note(&pool, &note, &user, notes::UpdateNotebookNoteInput {
            document_json: Some(document.clone()), ..Default::default()
        }).await?;
        let references: i64 = sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE note_id=$1")
            .bind(&note).fetch_one(&pool).await?;
        ensure!(references == 2, "An ordinary edit discarded migrated hashless media");
        let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM notebook_media_outbox WHERE action='delete'")
            .fetch_one(&pool).await?;
        ensure!(pending == 0, "Editing retained media must not schedule deletion");

        ensure!(notes::update_notebook_note(&pool, &note, &other_user, notes::UpdateNotebookNoteInput {
            document_json: Some(document), ..Default::default()
        }).await.is_err(), "Foreign user edited the note");

        // Removing a known hash still schedules its normal cleanup. A legacy
        // reference cannot be inferred absent from this hash-only document.
        notes::update_notebook_note(&pool, &note, &user, notes::UpdateNotebookNoteInput {
            document_json: Some(r#"{"root":{"children":[]}}"#.into()), ..Default::default()
        }).await?;
        let retained: (i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM notebook_media_references WHERE note_id=$1),(SELECT count(*) FROM notebook_media_blobs WHERE state='gc_pending')")
            .bind(&note).fetch_one(&pool).await?;
        ensure!(retained == (1, 1), "Known-hash cleanup or legacy retention regressed: {retained:?}");

        let api = Schema::build(Query::default(), Mutation::default(), Subscription::default())
            .data(Arc::new(Db::from_pool(pool.clone()))).finish();
        for (actor, expected) in [(&other_user, false), (&user, true), (&user, false)] {
            let subject: String = sqlx::query_scalar("SELECT clerk_uuid FROM users WHERE id=$1")
                .bind(actor).fetch_one(&pool).await?;
            let response = api.execute(Request::new("mutation($id:String!){deleteNotebookNote(id:$id)}")
                .variables(Variables::from_json(json!({"id":note})))
                .data(ClerkJwt {sub:subject,azp:None,exp:i32::MAX,iat:0,iss:"test".into(),nbf:0,sid:None,act:None,org:None,other:Default::default()})).await;
            ensure!(response.errors.is_empty(), "Delete failed: {:?}", response.errors);
            ensure!(response.data.into_json()?["deleteNotebookNote"] == expected, "Delete authorization/idempotency failed");
        }
        let deleted: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM notebook_media_references WHERE note_id=$1),(SELECT count(*) FROM notebook_media_blobs WHERE state='gc_pending'),(SELECT count(*) FROM notebook_media_outbox WHERE action='delete' AND available_at>now()+interval '23 hours')")
            .bind(&note).fetch_one(&pool).await?;
        ensure!(deleted == (0, 2, 2), "Explicit note deletion must clean up both blobs once after the grace period: {deleted:?}");
        Ok(())
    }.await;
    cleanup(admin, pool, &schema).await;
    result
}
