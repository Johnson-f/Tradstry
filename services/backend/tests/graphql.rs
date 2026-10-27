use std::sync::Arc;
use std::time::Duration;

use axum::http::HeaderValue;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use tradstry::app::{self, AppState};
use tradstry::auth::test_jwt::{self, PROJECT};
use tradstry::graphql::SESSION_ENDED_CLOSE_CODE;
use tradstry::stytch::fake::FakeStytch;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn spawn_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = app::router(
        AppState::new(test_jwt::test_verifier(), Arc::new(FakeStytch::default())),
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

#[tokio::test]
async fn me_reads_the_caller_from_the_token() {
    let address = spawn_server().await;
    let token = test_jwt::session_token("user-test-1", "ada@example.com", "Ada Trader");
    let (status, body) = post_graphql(
        &address,
        Some(&token),
        "{ me { stytchUserId email fullName sessionId } }",
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(
        body["data"]["me"],
        json!({
            "stytchUserId": "user-test-1",
            "email": "ada@example.com",
            "fullName": "Ada Trader",
            "sessionId": "session-user-test-1",
        })
    );
}

#[tokio::test]
async fn graphql_over_http_requires_a_token() {
    let address = spawn_server().await;
    let (status, body) = post_graphql(&address, None, "{ me { stytchUserId } }").await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "missing_token");
}

#[tokio::test]
async fn websocket_init_without_a_valid_token_is_refused() {
    let address = spawn_server().await;
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

#[tokio::test]
async fn an_authenticated_subscription_streams() {
    let address = spawn_server().await;
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
            "payload": { "query": "subscription { ticks(intervalMs: 50) }" },
        }),
    )
    .await;
    let first = next_json(&mut socket).await.unwrap();
    assert_eq!(first["type"], "next");
    assert_eq!(first["payload"]["data"]["ticks"], 1);
}

#[tokio::test]
async fn the_server_closes_the_socket_when_the_session_ends() {
    let address = spawn_server().await;
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
