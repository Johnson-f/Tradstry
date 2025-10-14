use actix_web::web;
use crate::replicache::{handle_push, handle_pull};

pub fn configure_replicache_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/replicache")
            .route("/push", web::post().to(handle_push))
            .route("/pull", web::post().to(handle_pull))
    );
}
