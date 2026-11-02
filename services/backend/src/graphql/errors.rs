use async_graphql::{Error, ErrorExtensions};
use tracing::error;

use crate::{users::AccountRequired, workspace::WorkspaceError};

pub fn coded(message: impl Into<String>, code: &'static str) -> Error {
    Error::new(message.into()).extend_with(|_, ext| ext.set("code", code))
}

/// Turns an internal error into a GraphQL error: known, user-actionable errors
/// keep their message and get a code; anything else is logged and hidden.
pub fn to_graphql(err: anyhow::Error) -> Error {
    if err.is::<AccountRequired>() {
        return coded(err.to_string(), "ACCOUNT_REQUIRED");
    }
    if let Some(workspace) = err.downcast_ref::<WorkspaceError>() {
        let code = match workspace {
            WorkspaceError::InvalidName => "INVALID_NAME",
            WorkspaceError::NotFound => "NOT_FOUND",
            WorkspaceError::LastWorkspace => "LAST_WORKSPACE",
        };
        return coded(workspace.to_string(), code);
    }
    error!(error = format!("{err:#}"), "GraphQL resolver failed");
    Error::new("Something went wrong. Try again.")
}
