use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

// Define a custom error type.
pub struct ApiError {
    status_code: StatusCode,
    message: String,
}

impl ApiError {
    pub fn new(status_code: StatusCode, message: &str) -> Self {
        Self { status_code, message: message.to_string() }
    }
}

// Implement IntoResponse for ApiError to convert it into a response.
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(json!({ "error": self.message }));
        (self.status_code, body).into_response()
    }
}
