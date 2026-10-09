package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"

	"tradstry-mcp/app"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Info(".env not loaded; using process environment", "error", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	err := app.Run(ctx)
	stop()
	if err != nil {
		slog.Error("tradstry-mcp stopped", "error", err)
		os.Exit(1)
	}
}
