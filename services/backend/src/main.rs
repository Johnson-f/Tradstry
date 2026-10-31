use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use tradstry::app::{self, AppState, Services};
use tradstry::auth::TokenVerifier;
use tradstry::auth::stytch::StytchClient;
use tradstry::brokerage::Brokerage;
use tradstry::brokerage::crypto::SecretBox;
use tradstry::config::Config;
use tradstry::db;
use tradstry::snaptrade::SnapTradeClient;

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
    let pool = db::connect(&config.database_url).await?;
    let brokerage = match &config.brokerage {
        Some(settings) => {
            let oauth_client_id = settings
                .snaptrade
                .oauth
                .as_ref()
                .map(|oauth| oauth.client_id.clone());
            info!(
                oauth = oauth_client_id.is_some(),
                "SnapTrade brokerage linking is on"
            );
            Some(Arc::new(Brokerage {
                pool: pool.clone(),
                client: Arc::new(SnapTradeClient::new(settings.snaptrade.clone())?),
                secrets: SecretBox::from_base64_key(&settings.encryption_key)?,
                website_url: reqwest::Url::parse(&config.website_url)
                    .context("WEBSITE_URL must be a URL")?,
                oauth_client_id,
                consumer_key: settings.snaptrade.consumer_key.clone(),
            }))
        }
        None => {
            warn!("SnapTrade is not configured; brokerage linking is off");
            None
        }
    };
    tradstry::trades::rebuild::spawn_upgrade(pool.clone());
    if let Some(brokerage) = &brokerage {
        brokerage.clone().spawn_background();
    }
    let state = AppState::new(Services {
        verifier,
        pool,
        stytch: Arc::new(stytch),
        stytch_webhook_secret: config.stytch_webhook_secret.clone(),
        brokerage,
    });
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
