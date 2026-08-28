use actix_cors::Cors;
use actix_web::{App, HttpServer, web};
use clerk_rs::validators::actix::ClerkMiddleware;
use log::info;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing_actix_web::TracingLogger;
use tradstry_backend::graphql;
use tradstry_backend::routes;
use tradstry_backend::service::agents::knowledge::VoyageClient;
use tradstry_backend::service::auth::create_jwks_provider;
use tradstry_backend::service::brokerage::client::BrokerageClient;
use tradstry_backend::service::brokerage::oauth::SnapTradeOAuthConfig;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::r2::R2Client;
use tradstry_backend::service::redis::client::RedisClient;
fn cors_allowed_origins() -> Vec<String> {
    let defaults = [
        "http://localhost:3038",
        "http://127.0.0.1:3038",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ];
    std::env::var("CORS_ALLOWED_ORIGINS")
        .ok()
        .map(|origins| {
            origins
                .split(',')
                .map(str::trim)
                .filter(|origin| !origin.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .filter(|origins| !origins.is_empty())
        .unwrap_or_else(|| defaults.into_iter().map(str::to_owned).collect())
}
// Multi-threaded Tokio runs the HTTP server and durable background workers.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");
    dotenvy::dotenv().ok();
    // Held for the life of the process: dropping it flushes pending events.
    let _sentry = tradstry_backend::service::telemetry::init();
    info!("Starting backend...");

    let db = Arc::new(Db::new().await?);
    tradstry_backend::service::notebook::projector::ensure_ready().await?;
    info!("Projector bundles ready");
    let r2_client = Arc::new(R2Client::from_env()?);
    let mut agent_service_value =
        tradstry_backend::service::agents::AgentService::from_env(db.as_ref())
            .await?
            .with_r2(r2_client.clone());
    let agent_embedding_provider = if agent_service_value.config().enabled {
        let voyage_client = Arc::new(VoyageClient::from_env()?);
        let embedding = Arc::new(
            tradstry_backend::service::agents::knowledge::VoyageEmbeddingProvider::new(
                voyage_client.clone(),
            ),
        );
        let knowledge = Arc::new(
            tradstry_backend::service::agents::knowledge::KnowledgeService::new(
                db.pool().clone(),
                embedding.clone(),
                Arc::new(
                    tradstry_backend::service::agents::knowledge::VoyageReranker::new(
                        voyage_client.clone(),
                    ),
                ),
            )?,
        );
        info!(
            "Voyage client configured with embedding model {}",
            voyage_client.config().embedding_model
        );
        agent_service_value = agent_service_value.with_knowledge(knowledge);
        Some(embedding)
    } else {
        None
    };
    let agent_service = Arc::new(agent_service_value);
    let brokerage_client = Arc::new(BrokerageClient::from_env()?);
    let snaptrade_oauth_config = SnapTradeOAuthConfig::from_env()?;
    let snaptrade_webhook_config = routes::snaptrade_webhook::SnapTradeWebhookConfig::from_env()?;
    let redis_client = match RedisClient::from_env().await {
        Ok(c) => {
            info!("Redis cache enabled");
            Some(Arc::new(c))
        }
        Err(e) => {
            log::warn!("Redis unavailable, running without cache: {e}");
            None
        }
    };
    // Doubly optional: analytics need both Redis for the queue and an app key.
    let countly = match redis_client.clone() {
        Some(redis) => match tradstry_backend::service::countly::Countly::from_env(redis) {
            Ok(client) => {
                info!("Countly analytics enabled");
                Some(Arc::new(client))
            }
            Err(e) => {
                log::warn!("Countly disabled: {e}");
                None
            }
        },
        None => {
            log::warn!("Countly disabled: requires Redis");
            None
        }
    };
    // Absent VAPID keys are a normal local state: the feed still works, nothing
    // is pushed anywhere.
    let push_sender: Option<Arc<dyn tradstry_backend::service::notifications::push::PushSender>> =
        match tradstry_backend::service::notifications::push::WebPushSender::from_env() {
            Ok(s) => {
                info!("Web push enabled");
                Some(Arc::new(s))
            }
            Err(e) => {
                log::warn!("Web push disabled: {e}");
                None
            }
        };
    let (notification_events_tx, _) =
        broadcast::channel::<tradstry_backend::graphql::notifications::NotificationPushed>(256);

    db.health_check().await?;
    info!("Database healthy and SeaORM schema contract verified");
    let clerk_secret = std::env::var("CLERK_SECRET_KEY")?;
    let jwks_provider_data = Arc::new(create_jwks_provider(&clerk_secret));
    info!("Clerk authentication configured");
    let schema = graphql::build_schema(
        agent_service.clone(),
        brokerage_client.clone(),
        snaptrade_oauth_config.clone(),
        redis_client.clone(),
        notification_events_tx.clone(),
    );
    let allowed_origins = cors_allowed_origins();

    // Cooperative shutdown signal for the background tasks. On SIGTERM/SIGINT we
    // flip this to `true`; each task stops at a safe point (between jobs/ticks,
    // never mid-write) so a clean exit can't tear the local replica.
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    let mut agent_worker_handles = Vec::new();
    let mut knowledge_worker_handles = Vec::new();
    let mut memory_worker_handles = Vec::new();
    let mut action_worker_handles = Vec::new();
    let mut summary_worker_handles = Vec::new();
    if agent_service.config().enabled {
        info!(
            "Starting {} TinyAgents workers",
            agent_service.config().worker_concurrency
        );
        for worker_index in 0..agent_service.config().worker_concurrency {
            let service = agent_service.clone();
            let shutdown_rx = shutdown_rx.clone();
            agent_worker_handles.push(tokio::spawn(async move {
                tradstry_backend::service::agents::execution::run_agent_worker(
                    service,
                    worker_index,
                    shutdown_rx,
                )
                .await;
            }));
        }
        {
            let service = agent_service.clone();
            let shutdown_rx = shutdown_rx.clone();
            memory_worker_handles.push(tokio::spawn(async move {
                tradstry_backend::service::agents::knowledge::run_memory_worker(
                    service,
                    0,
                    shutdown_rx,
                )
                .await;
            }));
        }
        {
            let service = agent_service.clone();
            let shutdown_rx = shutdown_rx.clone();
            summary_worker_handles.push(tokio::spawn(async move {
                tradstry_backend::service::agents::knowledge::run_conversation_summary_worker(
                    service,
                    0,
                    shutdown_rx,
                )
                .await;
            }));
        }
        {
            let service = agent_service.clone();
            let shutdown_rx = shutdown_rx.clone();
            action_worker_handles.push(tokio::spawn(async move {
                tradstry_backend::service::agents::actions::run_action_worker(
                    service,
                    0,
                    shutdown_rx,
                )
                .await;
            }));
        }
        let knowledge_indexer = Arc::new(
            tradstry_backend::service::agents::knowledge::KnowledgeIndexer::new(
                tradstry_backend::service::agents::knowledge::KnowledgeStore::new(
                    db.pool().clone(),
                ),
                agent_embedding_provider
                    .as_ref()
                    .expect("enabled agents require an embedding provider")
                    .clone(),
            ),
        );
        info!(
            "Starting {} agent knowledge index workers",
            agent_service.config().index_worker_concurrency
        );
        for worker_index in 0..agent_service.config().index_worker_concurrency {
            let indexer = knowledge_indexer.clone();
            let shutdown_rx = shutdown_rx.clone();
            let lease_seconds = agent_service.config().run_lease_seconds;
            knowledge_worker_handles.push(tokio::spawn(async move {
                tradstry_backend::service::agents::knowledge::run_knowledge_worker(
                    indexer,
                    worker_index,
                    lease_seconds,
                    shutdown_rx,
                )
                .await;
            }));
        }
    }

    // Brokerage sync scheduler
    let sync_handle = {
        let db = db.clone();
        let brokerage_client = brokerage_client.clone();
        let redis_client = redis_client.clone();
        let countly = countly.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::brokerage::sync::run_sync_scheduler(
                db,
                brokerage_client,
                redis_client,
                countly,
                shutdown_rx,
            )
            .await;
        })
    };

    // SnapTrade webhook processing is deliberately separate from ingestion:
    // HTTP acknowledges only after durable insert, then this worker retries
    // targeted reconciliation without relying on provider redelivery timing.
    let snaptrade_webhook_handle = {
        let db = db.clone();
        let brokerage_client = brokerage_client.clone();
        let redis_client = redis_client.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::brokerage::webhook::run_worker(
                db,
                brokerage_client,
                redis_client,
                shutdown_rx,
            )
            .await;
        })
    };

    // Notebook maintenance: re-seed notes stranded mid-seed, compact overgrown
    // update chains. Both spawn the projector, so neither may run on the write path.
    let notebook_maintenance_handle = {
        let db = db.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::notebook::maintenance::run_notebook_maintenance(
                db,
                shutdown_rx,
            )
            .await;
        })
    };

    let notifications_outbox_handle = {
        let db = db.clone();
        let notification_events = notification_events_tx.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::notifications::outbox_worker::run_outbox_worker(
                db,
                notification_events,
                shutdown_rx,
            )
            .await;
        })
    };

    let market_monitor_handle = {
        let db = db.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::market::monitor_worker::run_monitor_worker(db, shutdown_rx)
                .await;
        })
    };

    let notifications_schedule_handle = {
        let db = db.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::notifications::schedule_worker::run_schedule_worker(
                db,
                shutdown_rx,
            )
            .await;
        })
    };

    let notifications_delivery_handle = push_sender.map(|sender| {
        let db = db.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::notifications::delivery_worker::run_delivery_worker(
                db,
                sender,
                shutdown_rx,
            )
            .await;
        })
    });

    let notifications_prune_handle = {
        let db = db.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::notifications::prune::run_prune(db, shutdown_rx).await;
        })
    };

    let countly_handle = countly.clone().map(|countly| {
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            tradstry_backend::service::countly::worker::run_countly_worker(countly, shutdown_rx)
                .await;
        })
    });

    info!("Starting server on 0.0.0.0:7899");
    info!("Allowed CORS origins: {:?}", allowed_origins);
    let server = HttpServer::new(move || {
        let jwks_provider = create_jwks_provider(&clerk_secret);
        let cors = allowed_origins
            .iter()
            .fold(Cors::default(), |cors, origin| cors.allowed_origin(origin))
            .allowed_methods(vec!["GET", "POST", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::CONTENT_TYPE,
            ])
            .max_age(3600);
        App::new()
            // Outermost so a panic or error anywhere inside is reported with the
            // request attached, rather than as a bare stack trace.
            .wrap(sentry_actix::Sentry::new())
            // Opens a span per request; every log emitted while handling it
            // inherits the method, path, and request id without being told.
            .wrap(TracingLogger::default())
            .wrap(ClerkMiddleware::new(
                jwks_provider,
                Some(vec![
                    "/graphql".to_string(),
                    "/export".to_string(),
                    "/notebook/images/upload".to_string(),
                    "/notebook/images/{id}".to_string(),
                    "/notebook/media/upload".to_string(),
                    "/notebook/media/{hash}".to_string(),
                    "/notebook/media/{hash}/thumb".to_string(),
                ]),
                true,
            ))
            .wrap(cors)
            .app_data(web::Data::new(schema.clone()))
            .app_data(web::Data::new(db.clone()))
            .app_data(web::Data::new(r2_client.clone()))
            .app_data(web::Data::new(brokerage_client.clone()))
            .app_data(web::Data::new(snaptrade_webhook_config.clone()))
            .app_data(web::Data::new(snaptrade_oauth_config.clone()))
            .app_data(web::Data::new(jwks_provider_data.clone()))
            .app_data(web::Data::new(countly.clone()))
            .configure(routes::configure)
    })
    .bind("0.0.0.0:7899")?
    .run();

    // Stop the HTTP server gracefully on SIGTERM (Docker stop) / SIGINT (Ctrl-C):
    // actix drains in-flight requests, then `server` resolves. We don't rely on
    // actix's implicit signal handling so behaviour is explicit under #[tokio::main].
    let server_handle = server.handle();
    tokio::spawn(async move {
        wait_for_shutdown_signal().await;
        info!("Shutdown signal received; stopping HTTP server gracefully");
        server_handle.stop(true).await;
    });

    server.await?;

    // HTTP is drained. Now stop the background tasks at a safe point and give any
    // in-flight unit of work a bounded window to finish, so we exit cleanly instead
    // of being SIGKILLed mid-write (which is what tore the replica before).
    info!("HTTP server stopped; draining background tasks");
    let _ = shutdown_tx.send(true);
    if tokio::time::timeout(std::time::Duration::from_secs(20), async {
        for agent_worker_handle in agent_worker_handles {
            let _ = agent_worker_handle.await;
        }
        for knowledge_worker_handle in knowledge_worker_handles {
            let _ = knowledge_worker_handle.await;
        }
        for memory_worker_handle in memory_worker_handles {
            let _ = memory_worker_handle.await;
        }
        for action_worker_handle in action_worker_handles {
            let _ = action_worker_handle.await;
        }
        for summary_worker_handle in summary_worker_handles {
            let _ = summary_worker_handle.await;
        }
        let _ = sync_handle.await;
        let _ = snaptrade_webhook_handle.await;
        let _ = notebook_maintenance_handle.await;
        let _ = notifications_outbox_handle.await;
        let _ = market_monitor_handle.await;
        let _ = notifications_schedule_handle.await;
        if let Some(handle) = notifications_delivery_handle {
            let _ = handle.await;
        }
        let _ = notifications_prune_handle.await;
        if let Some(handle) = countly_handle {
            let _ = handle.await;
        }
    })
    .await
    .is_err()
    {
        log::warn!("Background tasks did not drain within 20s; exiting anyway");
    }
    info!("Shutdown complete");
    Ok(())
}

/// Resolve when the process receives SIGTERM (container stop) or SIGINT (Ctrl-C).
async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut sigterm =
            signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        let mut sigint = signal(SignalKind::interrupt()).expect("failed to install SIGINT handler");
        tokio::select! {
            _ = sigterm.recv() => {}
            _ = sigint.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
