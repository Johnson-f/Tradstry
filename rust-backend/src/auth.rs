use axum::{
    http::{header, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, decode_header, jwk, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

use crate::errors::ApiError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    // Add other claims from Supabase JWT as needed
    pub aud: String,
    pub role: String,
}

pub async fn auth_middleware(
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, ApiError> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let token = if let Some(auth_header) = auth_header.and_then(|h| h.strip_prefix("Bearer ")) {
        auth_header
    } else {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "Authorization header is missing or invalid",
        ));
    };

    let jwks_url = format!(
        "{}/auth/v1/.well-known/jwks.json",
        &crate::config::CONFIG.supabase_url
    );

    // In a production app, you should cache the JWKS response.
    // Fetching it on every request is inefficient.
    let jwks: jwk::JwkSet = reqwest::get(&jwks_url)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch JWKS"))?
        .json()
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to parse JWKS"))?;

    let header = decode_header(token)
        .map_err(|_| ApiError::new(StatusCode::UNAUTHORIZED, "Invalid token header"))?;

    let kid = header.kid.ok_or_else(|| {
        ApiError::new(StatusCode::UNAUTHORIZED, "Token missing 'kid' field")
    })?;

    if let Some(jwk) = jwks.find(&kid) {
        // Check if this is an RSA key (which supports RS256, RS384, RS512)
        match &jwk.algorithm {
            jsonwebtoken::jwk::AlgorithmParameters::RSA(_) => {
                // Convert KeyAlgorithm to Algorithm, defaulting to RS256 for Supabase
                let algorithm = match jwk.common.key_algorithm {
                    Some(jsonwebtoken::jwk::KeyAlgorithm::RS256) => jsonwebtoken::Algorithm::RS256,
                    Some(jsonwebtoken::jwk::KeyAlgorithm::RS384) => jsonwebtoken::Algorithm::RS384,
                    Some(jsonwebtoken::jwk::KeyAlgorithm::RS512) => jsonwebtoken::Algorithm::RS512,
                    _ => jsonwebtoken::Algorithm::RS256, // Default to RS256 for Supabase
                };

                let decoding_key = DecodingKey::from_jwk(jwk)
                    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create decoding key from JWK"))?;

                let mut validation = Validation::new(algorithm);
                validation.set_audience(&["authenticated"]);
                validation.set_issuer(&[&crate::config::CONFIG.supabase_url]);

                match decode::<Claims>(token, &decoding_key, &validation) {
                    Ok(token_data) => {
                        req.extensions_mut().insert(token_data.claims);
                        Ok(next.run(req).await)
                    }
                    Err(e) => {
                        let error_message = format!("Invalid token: {}", e);
                        Err(ApiError::new(StatusCode::UNAUTHORIZED, &error_message))
                    }
                }
            }
            _ => Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "Unsupported token algorithm - only RSA keys are supported",
            )),
        }
    } else {
        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "No matching JWK found for token",
        ))
    }
}