use std::future::{Ready, ready};
use std::rc::Rc;

use actix_web::{
    Error, HttpMessage, HttpResponse,
    body::EitherBody,
    dev::{Service, ServiceRequest, ServiceResponse, Transform, forward_ready},
};
use futures_util::future::LocalBoxFuture;

use super::{AuthError, TokenVerifier};

const SESSION_COOKIES: [&str; 2] = ["stytch_session_jwt", "__session"];

/// Puts the request's verified `AuthClaims` in its extensions, or answers 401,
/// on the listed paths. Paths match exactly.
pub struct AuthMiddleware {
    verifier: TokenVerifier,
    routes: Rc<Vec<String>>,
}

impl AuthMiddleware {
    pub fn new(verifier: TokenVerifier, routes: Vec<String>) -> Self {
        Self {
            verifier,
            routes: Rc::new(routes),
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for AuthMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthMiddlewareService {
            service: Rc::new(service),
            verifier: self.verifier.clone(),
            routes: self.routes.clone(),
        }))
    }
}

pub struct AuthMiddlewareService<S> {
    service: Rc<S>,
    verifier: TokenVerifier,
    routes: Rc<Vec<String>>,
}

impl<S, B> Service<ServiceRequest> for AuthMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
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
                None => Err(AuthError::Unauthorized(
                    "Error: No Authorization header or session cookie found on the request payload!"
                        .to_string(),
                )),
            };
            match result {
                Ok(claims) => {
                    request.extensions_mut().insert(claims);
                    Ok(service.call(request).await?.map_into_left_body())
                }
                Err(error) => {
                    let response = match error {
                        AuthError::Unauthorized(message) => {
                            HttpResponse::Unauthorized().body(message)
                        }
                        AuthError::Unavailable(message) => {
                            HttpResponse::ServiceUnavailable().body(message)
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
        None => SESSION_COOKIES
            .iter()
            .find_map(|name| request.cookie(name))
            .map(|cookie| cookie.value().to_string()),
    }
}
