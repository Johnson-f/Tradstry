use std::time::Duration;

use axum::http::HeaderValue;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream,
    tungstenite::{Message, client::IntoClientRequest},
};

use tradstry::{
    app::{self, AppState},
    auth::test_jwt::{self, PROJECT},
    graphql::SESSION_ENDED_CLOSE_CODE,
};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn spawn_server(pool: PgPool) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = app::router(
        AppState::new(app::test_services(pool)),
        vec![HeaderValue::from_static("http://localhost:5173")],
    );
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    address.to_string()
}

fn session_token_ending_in(seconds: i64) -> String {
    let now = chrono::Utc::now();
    let ends = now + chrono::Duration::seconds(seconds);
    test_jwt::sign(&json!({
        "iss": format!("stytch.com/{PROJECT}"),
        "sub": "user-test-1",
        "aud": [PROJECT],
        "iat": now.timestamp(),
        "nbf": now.timestamp() - 10,
        "exp": now.timestamp() + 300,
        "https://stytch.com/session": {"id": "session-1", "expires_at": ends.to_rfc3339()},
        "full_name": "Ada Trader",
        "emails": ["ada@example.com"],
    }))
}

async fn post_graphql(address: &str, token: Option<&str>, query: &str) -> (u16, Value) {
    let mut request = reqwest::Client::new()
        .post(format!("http://{address}/graphql"))
        .json(&json!({ "query": query }));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.unwrap();
    (response.status().as_u16(), response.json().await.unwrap())
}

async fn connect(address: &str) -> Socket {
    let mut request = format!("ws://{address}/graphql/ws")
        .into_client_request()
        .unwrap();
    request.headers_mut().insert(
        "sec-websocket-protocol",
        HeaderValue::from_static("graphql-transport-ws"),
    );
    tokio_tungstenite::connect_async(request).await.unwrap().0
}

async fn send(socket: &mut Socket, message: Value) {
    socket
        .send(Message::text(message.to_string()))
        .await
        .unwrap();
}

/// The next text frame as JSON, or `None` once the server closes.
async fn next_json(socket: &mut Socket) -> Option<Value> {
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("the server answers within five seconds")?;
        match frame.ok()? {
            Message::Text(text) => return Some(serde_json::from_str(&text).unwrap()),
            Message::Close(_) => return None,
            _ => {}
        }
    }
}

async fn close_code(socket: &mut Socket) -> Option<u16> {
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("the server closes within five seconds")?;
        if let Ok(Message::Close(frame)) = frame {
            return frame.map(|frame| frame.code.into());
        }
    }
}

#[sqlx::test]
async fn me_reads_the_caller_from_the_token(pool: PgPool) {
    let address = spawn_server(pool).await;
    let token = test_jwt::session_token("user-test-1", "ada@example.com", "Ada Trader");
    let (status, body) = post_graphql(
        &address,
        Some(&token),
        "{ me { id stytchUserId email fullName sessionId } }",
    )
    .await;
    assert_eq!(status, 200);
    let me = &body["data"]["me"];
    assert!(uuid::Uuid::parse_str(me["id"].as_str().unwrap()).is_ok());
    let mut me = me.clone();
    me.as_object_mut().unwrap().remove("id");
    assert_eq!(
        me,
        json!({
            "stytchUserId": "user-test-1",
            "email": "ada@example.com",
            "fullName": "Ada Trader",
            "sessionId": "session-user-test-1",
        })
    );
}

#[sqlx::test]
async fn graphql_over_http_requires_a_token(pool: PgPool) {
    let address = spawn_server(pool).await;
    let (status, body) = post_graphql(&address, None, "{ me { stytchUserId } }").await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "missing_token");
}

#[sqlx::test]
async fn websocket_init_without_a_valid_token_is_refused(pool: PgPool) {
    let address = spawn_server(pool).await;
    for payload in [json!({}), json!({ "token": "not-a-jwt" })] {
        let mut socket = connect(&address).await;
        send(
            &mut socket,
            json!({ "type": "connection_init", "payload": payload }),
        )
        .await;
        assert_eq!(next_json(&mut socket).await, None, "no ack for {payload}");
    }
}

/// The next frame, or None if nothing arrives within `ms`.
async fn frame_within(socket: &mut Socket, ms: u64) -> Option<Value> {
    match tokio::time::timeout(Duration::from_millis(ms), socket.next()).await {
        Ok(Some(Ok(Message::Text(text)))) => Some(serde_json::from_str(&text).unwrap()),
        _ => None,
    }
}

#[sqlx::test]
async fn changes_stream_to_their_owner_in_real_time(pool: PgPool) {
    let address = spawn_server(pool).await;
    let mut socket = connect(&address).await;
    let token = session_token_ending_in(3600);
    send(
        &mut socket,
        json!({ "type": "connection_init", "payload": { "token": format!("Bearer {token}") } }),
    )
    .await;
    assert_eq!(
        next_json(&mut socket).await.unwrap()["type"],
        "connection_ack"
    );
    send(
        &mut socket,
        json!({
            "id": "1",
            "type": "subscribe",
            "payload": { "query": "subscription { changes { topic workspaceId resync } }" },
        }),
    )
    .await;
    tokio::time::sleep(Duration::from_millis(300)).await;

    let stranger = test_jwt::session_token("user-test-2", "bo@example.com", "Bo Trader");
    let (status, _) = post_graphql(
        &address,
        Some(&stranger),
        r#"mutation { createWorkspace(name: "Theirs") { id } }"#,
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(
        frame_within(&mut socket, 500).await,
        None,
        "another user's change is not sent"
    );

    let (_, created) = post_graphql(
        &address,
        Some(&token),
        r#"mutation { createWorkspace(name: "Mine") { id } }"#,
    )
    .await;
    let workspace = created["data"]["createWorkspace"]["id"].clone();
    let first = next_json(&mut socket).await.unwrap();
    assert_eq!(first["type"], "next");
    assert_eq!(
        first["payload"]["data"]["changes"],
        json!({ "topic": "WORKSPACES", "workspaceId": null, "resync": false })
    );

    let (_, saved) = post_graphql(
        &address,
        Some(&token),
        &format!(
            r#"mutation {{ createTradePlan(workspaceId: "{}", input: {{ assetClass: STOCK, symbol: "AAPL",
                direction: LONG, tranches: [{{ percent: "100", entry: "100" }}], stop: "95", risk: "200" }}) {{ id }} }}"#,
            workspace.as_str().unwrap()
        ),
    )
    .await;
    assert!(saved["errors"].is_null(), "{saved}");
    let plan = next_json(&mut socket).await.unwrap();
    assert_eq!(
        plan["payload"]["data"]["changes"],
        json!({ "topic": "PLANS", "workspaceId": workspace, "resync": false }),
        "a change in a workspace names it"
    );
}

#[sqlx::test]
async fn the_server_closes_the_socket_when_the_session_ends(pool: PgPool) {
    let address = spawn_server(pool).await;
    let mut socket = connect(&address).await;
    send(
        &mut socket,
        json!({ "type": "connection_init", "payload": { "token": session_token_ending_in(1) } }),
    )
    .await;
    assert_eq!(
        next_json(&mut socket).await.unwrap()["type"],
        "connection_ack"
    );
    assert_eq!(
        close_code(&mut socket).await,
        Some(SESSION_ENDED_CLOSE_CODE)
    );
}
