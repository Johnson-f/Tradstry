use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

use tradstry::app::{self, AppState};
use tradstry::auth::TokenVerifier;
use tradstry::config::Config;
use tradstry::stytch::StytchClient;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .init();

    let config = Config::from_env()?;
    let verifier = TokenVerifier::stytch(
        &config.stytch.project_id,
        config.stytch.api_url.as_deref(),
        config.stytch.issuer.as_deref(),
    );
    let stytch = StytchClient::new(
        &config.stytch.project_id,
        &config.stytch.secret,
        config.stytch.api_url.as_deref(),
    )?;
    let state = AppState::new(verifier, Arc::new(stytch));
    let router = app::router(state, config.cors_allowed_origins.clone());

    let listener = TcpListener::bind(("0.0.0.0", config.port))
        .await
        .with_context(|| format!("bind port {}", config.port))?;
    info!(port = config.port, "listening");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    info!("stopped");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install the Ctrl-C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install the SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    info!("shutdown signal received, draining requests");
}
