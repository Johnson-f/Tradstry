package app

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

// 7900 is the Tradstry API's default, so both run side by side locally.
const defaultBindAddr = "0.0.0.0:7901"

type Config struct {
	BindAddr string
	// PublicURL is the origin MCP clients reach this server at, e.g. https://mcp.tradstry.com.
	PublicURL string
	// OAuthIssuer is the Stytch project domain that signs OAuth access tokens.
	OAuthIssuer string
	// OAuthAudience is the Stytch project ID, which Connected Apps put in every access token's aud.
	OAuthAudience string
	// APIURL is the Tradstry backend origin, e.g. https://backend.tradstry.com.
	APIURL string
}

func LoadConfig() (Config, error) {
	cfg := Config{BindAddr: os.Getenv("MCP_BIND_ADDR")}
	if cfg.BindAddr == "" {
		cfg.BindAddr = defaultBindAddr
	}

	var err error
	if cfg.PublicURL, err = origin("MCP_PUBLIC_URL"); err != nil {
		return Config{}, err
	}
	if cfg.OAuthIssuer, err = origin("OAUTH_ISSUER"); err != nil {
		return Config{}, err
	}
	if cfg.OAuthAudience = os.Getenv("OAUTH_AUDIENCE"); cfg.OAuthAudience == "" {
		return Config{}, fmt.Errorf("OAUTH_AUDIENCE must be set")
	}
	if cfg.APIURL, err = origin("TRADSTRY_API_URL"); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func origin(name string) (string, error) {
	raw := strings.TrimRight(os.Getenv(name), "/")
	if raw == "" {
		return "", fmt.Errorf("%s must be set", name)
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", fmt.Errorf("%s must be an absolute http(s) URL, got %q", name, raw)
	}
	return raw, nil
}
