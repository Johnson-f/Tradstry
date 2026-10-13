mod client;

pub use client::{
    CreateUser, MigratePassword, MigrateResponse, PersonName, Session, SessionAttributes,
    StytchClient, StytchError, StytchUser,
};

const TEST_API: &str = "https://test.stytch.com";
const LIVE_API: &str = "https://api.stytch.com";

/// Stytch serves `project-test-*` projects from a separate host. `api_url`
/// overrides the choice, for a local fake or a regional endpoint.
pub fn api_base(project_id: &str, api_url: Option<&str>) -> String {
    match api_url.filter(|url| !url.is_empty()) {
        Some(url) => url.trim_end_matches('/').to_owned(),
        None if project_id.starts_with("project-test-") => TEST_API.to_owned(),
        None => LIVE_API.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_host_from_the_project_id() {
        assert_eq!(api_base("project-test-1", None), TEST_API);
        assert_eq!(api_base("project-live-1", None), LIVE_API);
        assert_eq!(
            api_base("project-live-1", Some("http://localhost:9/")),
            "http://localhost:9"
        );
    }
}
