
mod auth;
mod config;
mod db;
mod user;

use actix_web::{web, App, HttpRequest, HttpServer, Responder, HttpMessage};
use dotenv::dotenv;

async fn protected(req: HttpRequest) -> impl Responder {
    let user = req.extensions().get::<user::User>().cloned().unwrap();
    format!("Hello, user {}!", user.id)
}

async fn public() -> impl Responder {
    "Hello, world!"
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    let config = config::Config::from_env();
    let app_data = web::Data::new(config);

    HttpServer::new(move || {
        App::new()
            .app_data(app_data.clone())
            .wrap(auth::Auth)
            .route("/api/protected", web::get().to(protected))
            .route("/auth/refresh", web::post().to(auth::refresh_token))
            .route("/", web::get().to(public))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
