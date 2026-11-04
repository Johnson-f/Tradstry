use std::{
    io::{Read, Write},
    net::TcpStream,
    sync::Arc,
    time::Duration,
};

use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use tradstry::{
    app::{self, AppState, Services},
    auth::{TokenVerifier, stytch::StytchClient},
    brokerage::{Brokerage, crypto::SecretBox},
    config::{Config, DEFAULT_PORT},
    db,
    mcp::McpSettings,
    snaptrade::SnapTradeClient,
};

// musl's allocator serialises threads, which slows the server in the Docker image.
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        return healthcheck();
    }
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .init();

    let config = Config::from_env()?;
    let stytch = Arc::new(StytchClient::new(
        &config.stytch.project_id,
        &config.stytch.secret,
        config.stytch.api_url.as_deref(),
    )?);
    let verifier = TokenVerifier::stytch(
        &config.stytch.project_id,
        config.stytch.api_url.as_deref(),
        config.stytch.issuer.as_deref(),
    )
    .with_remote(stytch.clone());
    let pool = db::connect(&config.database_url, &config.database_schema).await?;
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
    let mcp = match config.stytch.issuer.clone() {
        Some(issuer) => {
            info!(url = %format!("{}/mcp", config.mcp_public_url), "MCP server is on");
            Some(McpSettings {
                public_origin: config.mcp_public_url.clone(),
                issuer: issuer.clone(),
                verifier: TokenVerifier::stytch(
                    &config.stytch.project_id,
                    config.stytch.api_url.as_deref(),
                    Some(&issuer),
                ),
            })
        }
        None => {
            warn!("STYTCH_ISSUER is not set; the MCP server is off");
            None
        }
    };
    let state = AppState::new(Services {
        verifier,
        pool,
        stytch,
        stytch_webhook_secret: config.stytch_webhook_secret.clone(),
        brokerage,
        mcp,
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

/// Exits successfully when this server's /health answers 200. The Docker
/// image has no shell or curl, so its health check runs the binary instead.
fn healthcheck() -> Result<()> {
    let port = std::env::var("PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let timeout = Duration::from_secs(3);
    let mut stream = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), timeout)
        .context("connect to the server")?;
    stream.set_read_timeout(Some(timeout))?;
    stream.write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    let status = response.lines().next().unwrap_or_default();
    anyhow::ensure!(status.starts_with("HTTP/1.1 200"), "unhealthy: {status}");
    Ok(())
}
