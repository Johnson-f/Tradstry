package app

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

const defaultBindAddr = "0.0.0.0:7900"

type Config struct {
	BindAddr string
	// PublicURL is the origin MCP clients reach this server at, e.g. https://mcp.tradstry.com.
	PublicURL string
	// ClerkIssuer is the Clerk Frontend API origin that signs OAuth access tokens.
	ClerkIssuer string
	// APIURL is the Tradstry backend origin, e.g. https://backend.tradstry.com.
	APIURL string
	// RedisURL is where per-user rate limits are counted, e.g. redis://:password@redis:6379.
	RedisURL string
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
	if cfg.ClerkIssuer, err = origin("CLERK_ISSUER"); err != nil {
		return Config{}, err
	}
	if cfg.APIURL, err = origin("TRADSTRY_API_URL"); err != nil {
		return Config{}, err
	}
	if cfg.RedisURL = os.Getenv("REDIS_URL"); cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL must be set")
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
