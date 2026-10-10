package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tradstry-mcp/analytics"
	"tradstry-mcp/brokerage"
	"tradstry-mcp/clerk"
	"tradstry-mcp/confirm"
	"tradstry-mcp/graphql"
	"tradstry-mcp/journal"
	"tradstry-mcp/workspaces"
)

const version = "0.1.0"

const instructions = `Tradstry is a trading journal. You act for a user who already has a Tradstry account; accounts are created only by signing up at tradstry.com.
Call list_workspaces first: a workspace is one trading account, and most tools need its workspace_id.
Never pass a confirmation_token unless the user explicitly agreed, in this conversation, to the action it confirms.
To connect a broker: connect_brokerage gives a link for the user to open; when they are back, finish_brokerage_connection, then set_up_brokerage_accounts with the accounts and history the user chooses.
The journal turns broker executions into trades. To review, use next_trade_to_review or list_trades and get_trade, record context with update_trade_context, save the user's takeaway with save_trade_review, then mark_trade_reviewed. Takeaways, stops and plans are the user's: record what they say, never invent them.
For how trading went, use get_performance, get_daily_pnl, get_breakdown and get_mistake_costs; they report the exact period, currency and which trades were counted.
Trades made outside a connected broker are recorded with add_manual_trade; take every detail from the user and leave fees out when they don't know them.
A manual trade that overlaps a broker trade is left out of every total until the user says whether it is the same trade; ask them, then use resolve_possible_duplicate.`

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

func NewHandler(cfg Config, verifier *clerk.Verifier, api *graphql.Client) http.Handler {
	mcpServer, landing := newMCPServer(api, cfg.PublicURL)
	mcpHandler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return mcpServer }, nil)
	requireToken := sdkauth.RequireBearerToken(verifier.Verify, &sdkauth.RequireBearerTokenOptions{
		ResourceMetadataURL: cfg.PublicURL + clerk.MetadataPath,
	})

	mux := http.NewServeMux()
	clerk.RegisterMetadata(mux, cfg.PublicURL, cfg.ClerkIssuer)
	mux.Handle("/mcp", requireToken(mcpHandler))
	mux.Handle(brokerage.RoutePrefix, landing)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

func newMCPServer(api *graphql.Client, publicURL string) (*mcp.Server, http.Handler) {
	server := mcp.NewServer(
		&mcp.Implementation{Name: "tradstry", Title: "Tradstry", Version: version},
		&mcp.ServerOptions{Instructions: instructions},
	)
	confirmer := confirm.New()
	workspaces.Register(server, api, confirmer)
	landing := brokerage.Register(server, api, confirmer, publicURL)
	journal.Register(server, api, confirmer)
	analytics.Register(server, api)
	return server, landing
}
