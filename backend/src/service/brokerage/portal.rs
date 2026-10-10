use anyhow::{Context, Result, ensure};

/// Origins SnapTrade's connection portal may send the browser back to. Without
/// this, a caller could make the portal redirect a user to any site.
#[derive(Debug, Clone)]
pub struct PortalRedirects {
    origins: Vec<String>,
}

impl PortalRedirects {
    /// The web app's origins plus any listed in `SNAPTRADE_PORTAL_REDIRECT_ORIGINS`,
    /// such as the MCP server's.
    pub fn from_env(web_origins: &[String]) -> Result<Self> {
        let extra = std::env::var("SNAPTRADE_PORTAL_REDIRECT_ORIGINS").unwrap_or_default();
        Self::new(
            web_origins
                .iter()
                .map(String::as_str)
                .chain(extra.split(',').map(str::trim).filter(|o| !o.is_empty())),
        )
    }

    pub fn new<'a>(origins: impl IntoIterator<Item = &'a str>) -> Result<Self> {
        let origins = origins
            .into_iter()
            .map(|origin| {
                origin_of(origin)
                    .with_context(|| format!("invalid SnapTrade portal redirect origin {origin}"))
            })
            .collect::<Result<_>>()?;
        Ok(Self { origins })
    }

    pub fn check(&self, redirect: &str) -> Result<()> {
        let origin =
            origin_of(redirect).context("the return address must be an absolute http(s) URL")?;
        ensure!(
            self.origins.contains(&origin),
            "SnapTrade is not allowed to return to {origin}"
        );
        Ok(())
    }
}

fn origin_of(url: &str) -> Result<String> {
    let parsed = reqwest::Url::parse(url)?;
    ensure!(
        matches!(parsed.scheme(), "http" | "https"),
        "unsupported scheme {}",
        parsed.scheme()
    );
    Ok(parsed.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn redirects() -> PortalRedirects {
        PortalRedirects::new(["https://tradstry.com", "https://mcp.tradstry.com/"]).unwrap()
    }

    #[test]
    fn allows_known_origins_with_any_path() {
        let redirects = redirects();
        assert!(
            redirects
                .check("https://tradstry.com/dashboard/brokerage/callback?workspaceId=ws1")
                .is_ok()
        );
        assert!(
            redirects
                .check("https://mcp.tradstry.com/brokerage/connected?state=abc")
                .is_ok()
        );
    }

    #[test]
    fn refuses_everything_else() {
        let redirects = redirects();
        for redirect in [
            "https://evil.example/callback",
            "http://tradstry.com/callback",
            "https://tradstry.com:8443/callback",
            "https://tradstry.com.evil.example/callback",
            "https://tradstry.com@evil.example/callback",
            "javascript:alert(1)",
            "/dashboard/brokerage/callback",
            "",
        ] {
            assert!(redirects.check(redirect).is_err(), "{redirect} was allowed");
        }
    }

    #[test]
    fn rejects_a_misconfigured_origin() {
        assert!(PortalRedirects::new(["not a url"]).is_err());
        assert!(PortalRedirects::new(["ftp://tradstry.com"]).is_err());
    }
}
