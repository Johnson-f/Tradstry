package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Johnson-f/Tradstry-v2-/services/mcp/account"
	"github.com/Johnson-f/Tradstry-v2-/services/mcp/graphql"
	"github.com/Johnson-f/Tradstry-v2-/services/mcp/oauth"
)

const version = "0.1.0"

const statelessProtocol = "2026-07-28"

const instructions = `Tradstry is a trading journal. You act for a user who already has a Tradstry account; accounts are created only by signing up at tradstry.com.
Call get_account to see which account this app is connected to.`

// Run serves until ctx is cancelled.
func Run(ctx context.Context) error {
	cfg, err := LoadConfig()
	if err != nil {
		return err
	}
	verifier, err := oauth.NewVerifier(ctx, cfg.OAuthIssuer, cfg.OAuthAudience)
	if err != nil {
		return err
	}
	api := graphql.NewClient(cfg.APIURL, &http.Client{})

	server := &http.Server{
		Addr:              cfg.BindAddr,
		Handler:           NewHandler(cfg, verifier, api),
		ReadHeaderTimeout: 10 * time.Second,
	}
	serveErr := make(chan error, 1)
	go func() {
		slog.Info("tradstry-mcp listening", "addr", cfg.BindAddr, "public_url", cfg.PublicURL)
		serveErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// NewHandler serves MCP behind Stytch Connected Apps OAuth. Requests without a
// valid access token get a 401 whose WWW-Authenticate points at the metadata,
// which is how MCP clients discover where to sign the user in.
func NewHandler(cfg Config, verifier *oauth.Verifier, api *graphql.Client) http.Handler {
	requireToken := sdkauth.RequireBearerToken(verifier.Verify, &sdkauth.RequireBearerTokenOptions{
		ResourceMetadataURL: cfg.PublicURL + oauth.MetadataPath,
	})

	mux := http.NewServeMux()
	oauth.RegisterMetadata(mux, cfg.PublicURL, cfg.OAuthIssuer)
	mux.Handle("/mcp", requireToken(byProtocol(newMCPServer(api))))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

// byProtocol serves clients on the 2026-07-28 protocol, which has no sessions,
// statelessly: the SDK only accepts that protocol in stateless mode. Older
// clients keep their sessions.
func byProtocol(server *mcp.Server) http.Handler {
	getServer := func(*http.Request) *mcp.Server { return server }
	sessions := mcp.NewStreamableHTTPHandler(getServer, nil)
	stateless := mcp.NewStreamableHTTPHandler(getServer, &mcp.StreamableHTTPOptions{Stateless: true})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("MCP-Protocol-Version") >= statelessProtocol {
			stateless.ServeHTTP(w, r)
			return
		}
		sessions.ServeHTTP(w, r)
	})
}

func newMCPServer(api *graphql.Client) *mcp.Server {
	server := mcp.NewServer(
		&mcp.Implementation{Name: "tradstry", Title: "Tradstry", Version: version},
		&mcp.ServerOptions{Instructions: instructions},
	)
	account.Register(server, api)
	return server
}
