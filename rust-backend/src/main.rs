use axum::{middleware, routing::get, Router};
use std::net::SocketAddr;
use tokio;
use tower_http::cors::{Any, CorsLayer};

mod auth;
mod config;
mod errors;
mod handlers;

#[tokio::main]
async fn main() {
    // Load config
    let _ = &config::CONFIG;

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the app with routes
    let app = Router::new()
        .route("/api/protected", get(handlers::protected_handler))
        .layer(middleware::from_fn(auth::auth_middleware))
        .layer(cors);

    // Run the server
    let addr = SocketAddr::from(([127, 0, 0, 1], 8001));
    println!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
