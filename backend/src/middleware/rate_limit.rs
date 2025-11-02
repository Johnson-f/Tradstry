use actix_web::{
    dev::{ServiceRequest, ServiceResponse},
    middleware::Next,
    Error, HttpMessage, HttpResponse,
};
use actix_web::body::{BoxBody, MessageBody};
use actix_web::web::Data;
use actix_web::http::header::HeaderValue;
use base64::Engine;
use crate::turso::{AppState, SupabaseClaims, ClerkClaims, get_supabase_user_id, get_user_id};
use crate::service::rate_limiter::RateLimitError;
use serde_json::json;

/// Rate limit middleware for ActixWeb
/// 
/// This middleware:
/// 1. Extracts user ID from request extensions (after JWT validation)
/// 2. Checks rate limit using RateLimiter service
/// 3. Returns 429 if rate limit exceeded
/// 4. Adds rate limit headers to response if allowed
pub async fn rate_limit_middleware(
    req: ServiceRequest,
    next: Next<impl MessageBody + 'static>,
) -> Result<ServiceResponse<BoxBody>, Error> {
    // Get AppState from request
    let app_state = req
        .app_data::<Data<AppState>>()
        .ok_or_else(|| {
            actix_web::error::ErrorInternalServerError("AppState not found in request")
        })?;

    // Extract user ID from request extensions (set by JWT validator) or from Authorization header
    let user_id = {
        // First check extensions (requires borrow)
        let extensions = req.extensions();
        
        // Try Supabase claims first (set by HttpAuthentication::bearer)
        let user_id_from_extensions = if let Some(supabase_claims) = extensions.get::<SupabaseClaims>() {
            Some(get_supabase_user_id(supabase_claims))
        } else if let Some(clerk_claims) = extensions.get::<ClerkClaims>() {
            // Fallback to Clerk claims (legacy)
            Some(get_user_id(clerk_claims.clone())
                .map_err(|_| actix_web::error::ErrorBadRequest("Invalid user ID from Clerk claims"))?)
        } else {
            None
        };
        drop(extensions); // Drop borrow before we might move req
        
        if let Some(user_id) = user_id_from_extensions {
            user_id
        } else {
            // No claims in extensions - try extracting from Authorization header
            // This handles routes that extract JWT manually in handlers
            let auth_header = match req.headers().get("Authorization")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
            {
                Some(token) => token,
                None => {
                    // No auth header - this might be a public route, skip rate limiting
                    log::debug!("Rate limit middleware: No authorization header found, skipping rate limit check (likely public route)");
                    return Ok(next.call(req).await?.map_into_boxed_body());
                }
            };
            
            // Parse JWT claims from token (minimal parsing - just to get user ID)
            let parts: Vec<&str> = auth_header.split('.').collect();
            if parts.len() != 3 {
                log::warn!("Rate limit middleware: Invalid JWT format, skipping rate limit check");
                return Ok(next.call(req).await?.map_into_boxed_body());
            }
            
            let payload = parts[1];
            let decoded = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload) {
                Ok(d) => d,
                Err(_) => {
                    log::warn!("Rate limit middleware: Failed to decode JWT payload, skipping rate limit check");
                    return Ok(next.call(req).await?.map_into_boxed_body());
                }
            };
            
            let claims: SupabaseClaims = match serde_json::from_slice(&decoded) {
                Ok(c) => c,
                Err(_) => {
                    log::warn!("Rate limit middleware: Failed to parse JWT claims, skipping rate limit check");
                    return Ok(next.call(req).await?.map_into_boxed_body());
                }
            };
            
            get_supabase_user_id(&claims)
        }
    };

    // Check rate limit
    let rate_limit_result = app_state.rate_limiter.check_rate_limit(&user_id).await;

    match rate_limit_result {
        Ok(result) => {
            // Rate limit not exceeded - add headers and continue
            let mut res = next.call(req).await?;
            
            // Add rate limit headers
            res.headers_mut().insert(
                actix_web::http::header::HeaderName::from_static("x-ratelimit-limit"),
                HeaderValue::from_str(&result.limit.to_string())
                    .unwrap_or_else(|_| HeaderValue::from_static("300")),
            );
            
            res.headers_mut().insert(
                actix_web::http::header::HeaderName::from_static("x-ratelimit-remaining"),
                HeaderValue::from_str(&result.remaining.to_string())
                    .unwrap_or_else(|_| HeaderValue::from_static("0")),
            );
            
            res.headers_mut().insert(
                actix_web::http::header::HeaderName::from_static("x-ratelimit-reset"),
                HeaderValue::from_str(&result.reset_at.to_string())
                    .unwrap_or_else(|_| HeaderValue::from_static("0")),
            );
            
            Ok(res.map_into_boxed_body())
        }
        Err(RateLimitError::Exceeded { remaining, reset_at }) => {
            // Rate limit exceeded - return 429
            log::warn!(
                "Rate limit exceeded for user: {}, remaining: {}, reset_at: {}",
                user_id, remaining, reset_at
            );

            let error_response = json!({
                "success": false,
                "message": "Rate limit exceeded. Please try again later.",
                "error": "RATE_LIMIT_EXCEEDED",
                "limit": 300,
                "remaining": remaining,
                "reset_at": reset_at,
            });

            let (req_parts, _) = req.into_parts();
            
            let res = HttpResponse::TooManyRequests()
                .insert_header((
                    actix_web::http::header::HeaderName::from_static("x-ratelimit-limit"),
                    "300",
                ))
                .insert_header((
                    actix_web::http::header::HeaderName::from_static("x-ratelimit-remaining"),
                    remaining.to_string(),
                ))
                .insert_header((
                    actix_web::http::header::HeaderName::from_static("x-ratelimit-reset"),
                    reset_at.to_string(),
                ))
                .json(error_response);

            Ok(ServiceResponse::new(req_parts, res).map_into_boxed_body())
        }
        Err(RateLimitError::Redis(e)) => {
            // Redis error - log and allow request (fail open)
            // This prevents Redis outages from breaking the entire API
            log::error!("Rate limit Redis error: {}, allowing request", e);
            
            let mut res = next.call(req).await?;
            
            // Add error header to indicate rate limit check was skipped
            res.headers_mut().insert(
                actix_web::http::header::HeaderName::from_static("x-ratelimit-status"),
                HeaderValue::from_static("unavailable"),
            );
            
            Ok(res.map_into_boxed_body())
        }
    }
}

