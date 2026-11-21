use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use image::{DynamicImage, ImageFormat};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{io::Cursor, path::PathBuf};
use tower::ServiceExt;
use tradstry::{
    app::{self, AppState, Services},
    auth::test_jwt,
    db::new_id,
    trades::{
        notes::NoteDocument,
        service::{AnnotationInput, save_annotation},
    },
};
use uuid::Uuid;

fn router(pool: &PgPool, dir: PathBuf) -> Router {
    app::router(
        AppState::new(Services {
            note_images_dir: dir,
            ..app::test_services(pool.clone())
        }),
        vec![],
    )
}

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    mime: &str,
    bytes: Vec<u8>,
) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", mime);
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(bytes)).unwrap())
        .await
        .unwrap();
    let (parts, body) = response.into_parts();
    (
        parts.status,
        parts.headers,
        body.collect().await.unwrap().to_bytes().into(),
    )
}

#[sqlx::test]
async fn pasted_images_round_trip_from_private_disk_and_only_attach_to_their_note(pool: PgPool) {
    let owner = new_id();
    let workspace = new_id();
    sqlx::query(
        "INSERT INTO users (id,stytch_user_id) VALUES ($1,'paste-owner'), ($2,'other-user')",
    )
    .bind(owner)
    .bind(new_id())
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces (id,user_id,name) VALUES ($1,$2,'Journal')")
        .bind(workspace)
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    for trade in ["first", "other"] {
        sqlx::query("INSERT INTO trades (id,user_id,workspace_id,kind,instrument_key,instrument,asset_class,symbol,underlying,status,
          opened_at,max_quantity,open_quantity,gross,fees,income,entry_cost,fill_count,non_economic)
          VALUES ($1,$2,$3,'single','TEST','{}','stock','TEST','TEST','closed',now(),1,0,1,0,0,1,1,false)")
        .bind(trade).bind(owner).bind(workspace).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO trade_fills VALUES ($1,$2,1,$2,'open',now(),1,1,0,false)")
            .bind(owner)
            .bind(trade)
            .execute(&pool)
            .await
            .unwrap();
    }
    let dir = std::env::temp_dir().join(format!("tradstry-note-images-{}", new_id()));
    let app = router(&pool, dir.clone());
    let token = test_jwt::session_token("paste-owner", "owner@example.test", "Owner");
    let other = test_jwt::session_token("other-user", "other@example.test", "Other");
    let path = format!("/workspaces/{workspace}/trades/first/note-images");
    let mut document = NoteDocument::from("Image follows").0;
    for (format, mime, extension) in [
        (ImageFormat::Png, "image/png", "png"),
        (ImageFormat::Jpeg, "image/jpeg", "jpg"),
        (ImageFormat::WebP, "image/webp", "webp"),
    ] {
        let mut buf = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(2, 2)
            .write_to(&mut buf, format)
            .unwrap();
        let bytes = buf.into_inner();
        let endpoint = format!("{path}?requestId={}", new_id());
        assert_eq!(
            request(&app, "POST", &endpoint, Some(&other), mime, bytes.clone())
                .await
                .0,
            StatusCode::NOT_FOUND
        );
        let (status, _, result) =
            request(&app, "POST", &endpoint, Some(&token), mime, bytes.clone()).await;
        assert_eq!(
            status,
            StatusCode::OK,
            "{}",
            String::from_utf8_lossy(&result)
        );
        let id = serde_json::from_slice::<Value>(&result).unwrap()["imageId"]
            .as_str()
            .unwrap()
            .to_owned();
        Uuid::parse_str(&id).unwrap();
        assert_eq!(
            std::fs::read(dir.join(format!("{id}.{extension}"))).unwrap(),
            bytes
        );
        assert_eq!(
            request(&app, "POST", &endpoint, Some(&token), mime, bytes.clone())
                .await
                .2,
            result
        );
        for (who, status) in [
            (None, StatusCode::UNAUTHORIZED),
            (Some(other.as_str()), StatusCode::NOT_FOUND),
        ] {
            assert_eq!(
                request(&app, "GET", &format!("{path}/{id}"), who, mime, vec![])
                    .await
                    .0,
                status
            );
        }
        document["root"]["children"][0]["children"]
            .as_array_mut()
            .unwrap()
            .push(json!({"type":"note-image","version":1,"imageId":id}));
    }
    let input = AnnotationInput {
        notes: NoteDocument(document.clone()),
        ..Default::default()
    };
    assert!(
        save_annotation(&pool, &dir, owner, workspace, "other", None, &input)
            .await
            .is_err()
    );
    let note_id = save_annotation(&pool, &dir, owner, workspace, "first", None, &input)
        .await
        .unwrap();
    let stored: Value = sqlx::query_scalar("SELECT notes FROM trade_annotations WHERE id=$1")
        .bind(note_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, document);
    let id = stored["root"]["children"][0]["children"][1]["imageId"]
        .as_str()
        .unwrap();
    let reopened = router(&pool, dir.clone());
    let (status, headers, body) = request(
        &reopened,
        "GET",
        &format!("{path}/{id}"),
        Some(&token),
        "image/png",
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["content-type"], "image/png");
    assert_eq!(body, std::fs::read(dir.join(format!("{id}.png"))).unwrap());
    assert_eq!(
        request(
            &reopened,
            "GET",
            &format!("/workspaces/{workspace}/trades/other/note-images/{id}"),
            Some(&token),
            "image/png",
            vec![]
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let bad = format!("{path}?requestId={}", new_id());
    assert_eq!(
        request(
            &app,
            "POST",
            &bad,
            Some(&token),
            "image/png",
            b"not a png".to_vec()
        )
        .await
        .0,
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    assert_eq!(
        request(
            &app,
            "POST",
            &bad,
            Some(&token),
            "image/png",
            vec![0; 8 * 1024 * 1024 + 1]
        )
        .await
        .0,
        StatusCode::PAYLOAD_TOO_LARGE
    );
    let mut reduced = input.clone();
    reduced.notes.0["root"]["children"][0]["children"]
        .as_array_mut()
        .unwrap()
        .remove(1);
    assert!(
        save_annotation(&pool, &dir, owner, workspace, "first", Some(0), &reduced)
            .await
            .is_err()
    );
    assert!(
        dir.join(format!("{id}.png")).is_file(),
        "a rejected save must not delete anything"
    );
    let mut duplicated = input.clone();
    let first_image = duplicated.notes.0["root"]["children"][0]["children"][1].clone();
    duplicated.notes.0["root"]["children"][0]["children"]
        .as_array_mut()
        .unwrap()
        .push(first_image);
    save_annotation(&pool, &dir, owner, workspace, "first", Some(1), &duplicated)
        .await
        .unwrap();
    save_annotation(&pool, &dir, owner, workspace, "first", Some(2), &input)
        .await
        .unwrap();
    assert!(
        dir.join(format!("{id}.png")).is_file(),
        "another reference keeps the file"
    );
    // A stale client-side discard cannot delete a committed attachment.
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("{path}/{id}/discard"),
            Some(&token),
            "image/png",
            vec![]
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(dir.join(format!("{id}.png")).is_file());
    save_annotation(&pool, &dir, owner, workspace, "first", Some(3), &reduced)
        .await
        .unwrap();
    assert!(
        !dir.join(format!("{id}.png")).exists(),
        "the last reference unlinks the file before save returns"
    );
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2);
    assert_eq!(
        request(
            &reopened,
            "GET",
            &format!("{path}/{id}"),
            Some(&token),
            "image/png",
            vec![]
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert!(
        save_annotation(&pool, &dir, owner, workspace, "first", Some(4), &input)
            .await
            .is_err(),
        "stale devices cannot reattach a purged ID"
    );
    let other_path = format!("/workspaces/{workspace}/trades/other/note-images");
    let (status, _, uploaded) = request(
        &app,
        "POST",
        &format!("{other_path}?requestId={}", new_id()),
        Some(&token),
        "image/png",
        body,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let other_image = serde_json::from_slice::<Value>(&uploaded).unwrap()["imageId"]
        .as_str()
        .unwrap()
        .to_owned();
    for (path, bearer) in [(&other_path, &other), (&path, &token)] {
        request(
            &app,
            "POST",
            &format!("{path}/{other_image}/discard"),
            Some(bearer),
            "image/png",
            vec![],
        )
        .await;
        assert!(
            dir.join(format!("{other_image}.png")).is_file(),
            "another user or trade cannot discard this upload"
        );
    }
    let mut other_note = AnnotationInput::default();
    other_note.notes.0["root"]["children"][0]["children"] =
        json!([{"type":"note-image","version":1,"imageId":other_image}]);
    let other_note_id = save_annotation(&pool, &dir, owner, workspace, "other", None, &other_note)
        .await
        .unwrap();
    tradstry::trades::service::delete_annotation(&pool, &dir, owner, other_note_id)
        .await
        .unwrap();
    assert!(!dir.join(format!("{other_image}.png")).exists());
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2);
    sqlx::query("DELETE FROM users WHERE id=$1")
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    tradstry::trades::note_images::start_cleanup(pool.clone(), dir.clone());
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while std::fs::read_dir(&dir).unwrap().next().is_some() {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("account deletion cleans up private image files");
    std::fs::remove_dir_all(dir).unwrap();
}
