use actix_web::{HttpMessage, HttpRequest, HttpResponse, Result, web};
use async_graphql::Data;
use async_graphql::http::GraphiQLSource;
use async_graphql_actix_web::{GraphQLRequest, GraphQLResponse, GraphQLSubscription};
use clerk_rs::validators::authorizer::ClerkJwt;
use clerk_rs::validators::{authorizer::validate_jwt, jwks::MemoryCacheJwksProvider};
use log::{error, info};
use std::sync::Arc;
use std::time::Instant;

use crate::graphql::AppSchema;
use crate::service::db::Db;
use crate::service::upload::r2::R2Client;

fn infer_operation_name(query: &str) -> &str {
    query
        .split_whitespace()
        .collect::<Vec<_>>()
        .windows(2)
        .find_map(|parts| match parts {
            ["query" | "mutation" | "subscription", name] => Some(*name),
            _ => None,
        })
        .unwrap_or("anonymous")
}

pub async fn graphql_handler(
    schema: web::Data<AppSchema>,
    http_req: HttpRequest,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    let started_at = Instant::now();
    let mut request = req.into_inner();
    let operation_name = request
        .operation_name
        .clone()
        .unwrap_or_else(|| infer_operation_name(&request.query).to_string());
    let query_preview = request
        .query
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let auth = http_req.extensions().get::<ClerkJwt>().cloned();
    let auth_subject = auth
        .as_ref()
        .map(|jwt| jwt.sub.clone())
        .unwrap_or_else(|| "anonymous".to_string());

    info!(
        "GraphQL request: operation={} method={} path={} auth_subject={} query_preview={:?}",
        operation_name,
        http_req.method(),
        http_req.path(),
        auth_subject,
        query_preview
    );

    if let Some(jwt) = auth {
        request = request.data(jwt);
    }
    request = request.data(db.get_ref().clone());
    request = request.data(r2.get_ref().clone());
    request = request.data(async_graphql::dataloader::DataLoader::new(
        crate::graphql::tags::TagLoader {
            db: db.get_ref().clone(),
        },
        tokio::spawn,
    ));
    request = request.data(crate::graphql::auth::RequestUser::default());

    let response = schema.execute(request).await;
    let elapsed_ms = started_at.elapsed().as_millis();

    if response.errors.is_empty() {
        info!(
            "GraphQL success: operation={} auth_subject={} error_count=0 duration_ms={}",
            operation_name, auth_subject, elapsed_ms
        );
    } else {
        error!(
            "GraphQL failure: operation={} auth_subject={} duration_ms={} errors={:?}",
            operation_name, auth_subject, elapsed_ms, response.errors
        );
    }

    response.into()
}

pub async fn graphiql() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(GraphiQLSource::build().endpoint("/graphql").finish()))
}

pub async fn graphql_ws_handler(
    schema: web::Data<AppSchema>,
    http_req: HttpRequest,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
    jwks: web::Data<Arc<MemoryCacheJwksProvider>>,
    payload: web::Payload,
) -> Result<HttpResponse> {
    let mut data = Data::default();

    if let Some(jwt) = http_req.extensions().get::<ClerkJwt>().cloned() {
        data.insert(jwt);
    }
    data.insert(db.get_ref().clone());
    data.insert(r2.get_ref().clone());
    data.insert(crate::graphql::auth::RequestUser::default());

    GraphQLSubscription::new(schema.get_ref().clone())
        .with_data(data)
        .on_connection_init({
            let jwks = jwks.get_ref().clone();
            move |payload| {
                let jwks = jwks.clone();
                async move {
                    let mut data = Data::default();
                    if let Some(token) = payload
                        .get("authorization")
                        .and_then(|value| value.as_str())
                        .or_else(|| payload.get("token").and_then(|value| value.as_str()))
                    {
                        let token = token.trim().trim_start_matches("Bearer ").to_string();
                        let jwt = validate_jwt(&token, jwks)
                            .await
                            .map_err(|error| async_graphql::Error::new(error.to_string()))?;
                        data.insert(jwt);
                    }
                    Ok(data)
                }
            }
        })
        .start(&http_req, payload)
}
