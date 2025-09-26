use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    error, Error,
    http::header::HeaderValue,
    web,
    HttpMessage,
    HttpResponse,
};
use futures_util::future::{self, Ready};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use std::task::{Context, Poll};
use std::pin::Pin;
use futures_util::Future;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
}

pub fn validate_token(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token = token.replace("Bearer ", "");
    let key = DecodingKey::from_secret(secret.as_ref());
    let validation = Validation::new(Algorithm::HS256);
    decode::<Claims>(&token, &key, &validation).map(|data| data.claims)
}

pub async fn refresh_token(req: web::Json<RefreshRequest>, config: web::Data<crate::config::Config>) -> Result<HttpResponse, Error> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/auth/v1/token?grant_type=refresh_token", config.supabase_url))
        .header("apikey", &config.supabase_key)
        .json(&req.into_inner())
        .send()
        .await
        .map_err(error::ErrorInternalServerError)?;

    if res.status().is_success() {
        let refresh_response = res.json::<RefreshResponse>().await.map_err(error::ErrorInternalServerError)?;
        Ok(HttpResponse::Ok().json(refresh_response))
    } else {
        Err(error::ErrorUnauthorized("invalid refresh token"))
    }
}

pub struct Auth;

impl<S, B> Transform<S, ServiceRequest> for Auth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = AuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        future::ready(Ok(AuthMiddleware { service }))
    }
}

pub struct AuthMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for AuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        if req.path() == "/" || req.path() == "/auth/refresh" { // Don't protect the public and refresh routes
            let fut = self.service.call(req);
            return Box::pin(async move {
                let res = fut.await?;
                Ok(res)
            });
        }

        let token = req.headers().get("Authorization").map(HeaderValue::to_str).transpose().unwrap_or(None);

        if let Some(token) = token {
            if let Some(config) = req.app_data::<web::Data<crate::config::Config>>() {
                match validate_token(token, &config.jwt_secret) {
                    Ok(claims) => {
                        let user = crate::user::User { id: claims.sub };
                        req.extensions_mut().insert(user);
                        let fut = self.service.call(req);
                        return Box::pin(async move {
                            let res = fut.await?;
                            Ok(res)
                        });
                    }
                    Err(_) => {
                        return Box::pin(async move {
                            Err(error::ErrorUnauthorized("invalid token"))
                        });
                    }
                }
            }
        }

        Box::pin(async move {
            Err(error::ErrorUnauthorized("invalid token"))
        })
    }
}
