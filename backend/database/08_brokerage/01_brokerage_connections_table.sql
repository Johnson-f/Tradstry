-- Brokerage connections table (SnapTrade integration)
CREATE TABLE IF NOT EXISTS brokerage_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    snaptrade_user_id TEXT NOT NULL,
    snaptrade_user_secret TEXT NOT NULL,
    connection_id TEXT,
    brokerage_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brokerage_connections_user_id ON brokerage_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_brokerage_connections_connection_id ON brokerage_connections(connection_id);
CREATE INDEX IF NOT EXISTS idx_brokerage_connections_status ON brokerage_connections(status);

