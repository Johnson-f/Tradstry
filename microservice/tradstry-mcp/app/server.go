package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
	"tradstry-mcp/workspaces"
)

const version = "0.1.0"

const instructions = `Tradstry is a trading journal. You act for a user who already has a Tradstry account; accounts are created only by signing up at tradstry.com.
Call list_workspaces first: a workspace is one trading account, and most tools need its workspace_id.
Never pass a confirmation_token unless the user explicitly agreed, in this conversation, to the action it confirms.`

// Run serves until ctx is cancelled.
func Run(ctx context.Context) error {
	cfg, err := LoadConfig()
	if err != nil {
		return err
	}
	verifier, err := clerk.NewVerifier(ctx, cfg.ClerkIssuer)
	if err != nil {
		return err
	}
	api := graphql.NewClient(cfg.APIURL, &http.Client{Timeout: 30 * time.Second})

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

func NewHandler(cfg Config, verifier *clerk.Verifier, api *graphql.Client) http.Handler {
	mcpServer := newMCPServer(api)
	mcpHandler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return mcpServer }, nil)
	requireToken := sdkauth.RequireBearerToken(verifier.Verify, &sdkauth.RequireBearerTokenOptions{
		ResourceMetadataURL: cfg.PublicURL + clerk.MetadataPath,
	})

	mux := http.NewServeMux()
	clerk.RegisterMetadata(mux, cfg.PublicURL, cfg.ClerkIssuer)
	mux.Handle("/mcp", requireToken(mcpHandler))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

func newMCPServer(api *graphql.Client) *mcp.Server {
	server := mcp.NewServer(
		&mcp.Implementation{Name: "tradstry", Title: "Tradstry", Version: version},
		&mcp.ServerOptions{Instructions: instructions},
	)
	workspaces.Register(server, api, confirm.New())
	return server
}
