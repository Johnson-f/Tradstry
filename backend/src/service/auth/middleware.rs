use std::future::{Ready, ready};
use std::rc::Rc;

use actix_web::{
    Error, HttpMessage, HttpResponse,
    body::EitherBody,
    dev::{Service, ServiceRequest, ServiceResponse, Transform, forward_ready},
};
use clerk_rs::validators::{authorizer::ClerkError, jwks::JwksProvider};
use futures_util::future::LocalBoxFuture;

use super::TokenVerifier;

/// Puts the request's verified `ClerkJwt` in its extensions, or answers 401,
/// on the listed paths. A drop-in for clerk-rs's `ClerkMiddleware` that
/// verifies with [`TokenVerifier`], so OAuth access tokens with an audience
/// are accepted. Paths match exactly, as they did with `ClerkMiddleware`.
pub struct ClerkAuth<J> {
    verifier: TokenVerifier<J>,
    routes: Rc<Vec<String>>,
}

impl<J> ClerkAuth<J> {
    pub fn new(verifier: TokenVerifier<J>, routes: Vec<String>) -> Self {
        Self {
            verifier,
            routes: Rc::new(routes),
        }
    }
}

impl<S, B, J> Transform<S, ServiceRequest> for ClerkAuth<J>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
    J: JwksProvider + 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type InitError = ();
    type Transform = ClerkAuthService<S, J>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(ClerkAuthService {
            service: Rc::new(service),
            verifier: self.verifier.clone(),
            routes: self.routes.clone(),
        }))
    }
}

pub struct ClerkAuthService<S, J> {
    service: Rc<S>,
    verifier: TokenVerifier<J>,
    routes: Rc<Vec<String>>,
}

impl<S, B, J> Service<ServiceRequest> for ClerkAuthService<S, J>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
    J: JwksProvider + 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, request: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        if !self.routes.iter().any(|route| route == request.path()) {
            return Box::pin(async move { Ok(service.call(request).await?.map_into_left_body()) });
        }

        let verifier = self.verifier.clone();
        Box::pin(async move {
            let result = match request_token(&request) {
                Some(token) => verifier.verify(&token).await,
                None => Err(ClerkError::Unauthorized(
                    "Error: No Authorization header or session cookie found on the request payload!"
                        .to_string(),
                )),
            };
            match result {
                Ok(jwt) => {
                    request.extensions_mut().insert(jwt);
                    Ok(service.call(request).await?.map_into_left_body())
                }
                Err(error) => {
                    let response = match error {
                        ClerkError::Unauthorized(message) => {
                            HttpResponse::Unauthorized().body(message)
                        }
                        ClerkError::InternalServerError(message) => {
                            HttpResponse::InternalServerError().body(message)
                        }
                    };
                    Ok(request.into_response(response).map_into_right_body())
                }
            }
        })
    }
}

fn request_token(request: &ServiceRequest) -> Option<String> {
    match request.headers().get("Authorization") {
        Some(header) => header
            .to_str()
            .ok()
            .map(|value| value.trim_start_matches("Bearer ").to_string()),
        None => request
            .cookie("__session")
            .map(|cookie| cookie.value().to_string()),
    }
}
