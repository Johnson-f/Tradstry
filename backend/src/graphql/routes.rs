use async_graphql::{
    Data, Error,
    http::{ALL_WEBSOCKET_PROTOCOLS, GraphiQLSource},
};
use async_graphql_axum::{GraphQLProtocol, GraphQLRequest, GraphQLResponse, GraphQLWebSocket};
use axum::{
    extract::{
        State,
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
    },
    response::{Html, IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use futures_channel::mpsc;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::watch;

use crate::{
    app::AppState,
    auth::{AuthClaims, AuthRejection, TokenVerifier},
};

/// Sent when the session behind a subscription connection ends. graphql-ws
/// clients retry codes outside their fatal list, and the retry re-runs
/// `connectionParams`, so a still-signed-in client reconnects with a fresh JWT.
pub const SESSION_ENDED_CLOSE_CODE: u16 = 4100;

pub async fn graphql_handler(
    State(state): State<AppState>,
    claims: AuthClaims,
    request: GraphQLRequest,
) -> GraphQLResponse {
    let request = request
        .into_inner()
        .data(claims)
        .data(super::RequestUser::default());
    state.schema.execute(request).await.into()
}

pub async fn graphiql() -> Html<String> {
    Html(
        GraphiQLSource::build()
            .endpoint("/graphql")
            .subscription_endpoint("/graphql/ws")
            .finish(),
    )
}

pub async fn graphql_ws_handler(
    State(state): State<AppState>,
    protocol: GraphQLProtocol,
    upgrade: WebSocketUpgrade,
) -> Response {
    upgrade
        .protocols(ALL_WEBSOCKET_PROTOCOLS)
        .on_upgrade(move |socket| serve_socket(socket, state, protocol))
        .into_response()
}

/// Browsers cannot set headers on a WebSocket, so the token arrives in the
/// `connection_init` payload. GraphQL frames flow through a channel to a writer
/// this function owns, which lets it close the socket itself when access ends.
async fn serve_socket(socket: WebSocket, state: AppState, protocol: GraphQLProtocol) {
    let (mut socket_tx, socket_rx) = socket.split();
    let (frames_tx, mut frames_rx) = mpsc::unbounded::<Message>();
    let (deadline_tx, deadline_rx) = watch::channel::<Option<DateTime<Utc>>>(None);

    let input = socket_rx.take_until(access_ended(deadline_rx.clone()));
    let verifier = state.verifier.clone();
    let graphql = GraphQLWebSocket::new_with_pair(frames_tx, input, state.schema.clone(), protocol)
        .on_connection_init(move |payload| async move {
            let claims = authenticate_init(&verifier, &payload).await?;
            deadline_tx.send_replace(claims.access_ends_at());
            let mut data = Data::default();
            data.insert(claims);
            data.insert(super::RequestUser::default());
            Ok(data)
        })
        .serve();

    let writer = async move {
        let ended = access_ended(deadline_rx);
        tokio::pin!(ended);
        loop {
            tokio::select! {
                frame = frames_rx.next() => {
                    let Some(frame) = frame else { break };
                    if socket_tx.send(frame).await.is_err() {
                        break;
                    }
                }
                () = &mut ended => {
                    let close = CloseFrame {
                        code: SESSION_ENDED_CLOSE_CODE,
                        reason: "session_ended".into(),
                    };
                    let _ = socket_tx.send(Message::Close(Some(close))).await;
                    break;
                }
            }
        }
    };

    tokio::join!(graphql, writer);
}

async fn authenticate_init(
    verifier: &TokenVerifier,
    payload: &Value,
) -> async_graphql::Result<AuthClaims> {
    let token = ["authorization", "token"]
        .iter()
        .find_map(|key| payload.get(key).and_then(Value::as_str))
        .map(|token| token.trim().trim_start_matches("Bearer ").trim())
        .filter(|token| !token.is_empty())
        .ok_or_else(|| Error::new(AuthRejection::MissingToken.code()))?;
    verifier
        .verify(token)
        .await
        .map_err(|error| Error::new(AuthRejection::Rejected(error).code()))
}

/// Resolves once the connection's access deadline is known and has passed.
/// Stays pending forever for a connection that never authenticates or whose
/// token states no end.
async fn access_ended(mut deadline: watch::Receiver<Option<DateTime<Utc>>>) {
    let at = loop {
        if let Some(at) = *deadline.borrow_and_update() {
            break at;
        }
        if deadline.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    };
    let wait = (at - Utc::now()).to_std().unwrap_or_default();
    tokio::time::sleep(wait).await;
}
