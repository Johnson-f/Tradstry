-- MCP clients start SnapTrade OAuth too; their attempts return the browser to the MCP server.
ALTER TABLE snaptrade_oauth_attempts DROP CONSTRAINT IF EXISTS snaptrade_oauth_attempts_platform_check;
ALTER TABLE snaptrade_oauth_attempts ADD CONSTRAINT snaptrade_oauth_attempts_platform_check
    CHECK (platform = ANY (ARRAY['web'::text, 'desktop'::text, 'mcp'::text]));
