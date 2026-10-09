# Tradstry MCP server

Lets a Tradstry user work from an MCP client such as Claude or ChatGPT instead
of the tradstry.com UI. The plan is
`docs/plans/2026-10-09-feature-tradstry-mcp-go-plan.md`.

The server holds no database or storage credentials. It verifies the caller's
Clerk OAuth access token, then calls the backend's GraphQL API with that same
token, so the backend enforces ownership exactly as it does for the web app.
Accounts are created only by signing up on tradstry.com; the backend answers
`ACCOUNT_REQUIRED` for anyone else, and tools relay that as a sign-up message.

## Layout

Code is grouped by feature. A new feature gets its own folder with its tools,
its GraphQL operations and its tests, and registers itself in `app/server.go`.

| Folder | Contents |
| --- | --- |
| `app/` | Configuration, HTTP server and MCP server setup |
| `clerk/` | Token verification and sign-in discovery metadata |
| `graphql/` | Client for the Tradstry API and its error handling |
| `confirm/` | User confirmation before actions that cannot be undone |
| `workspaces/` | `list_workspaces`, `create_workspace`, `update_workspace`, `delete_workspace` |
| `mcptest/` | Test support: the real server in front of a fake Tradstry API |

## Confirming destructive actions

Tools such as `delete_workspace` never act on the assistant's word alone.

- **Clients that support elicitation:** the server asks the user directly with a form.
- **Other clients:** the first call changes nothing. It returns `needs_confirmation`, the question for the user, and a `confirmation_token`. The token is bound to that user and that record and expires in 10 minutes. The assistant passes it back only after the user agrees.

The signing key is generated at startup, so outstanding tokens stop working when the server restarts.

## Configuration

Create `microservice/tradstry-mcp/.env`:

```bash
MCP_PUBLIC_URL=http://localhost:7910
CLERK_ISSUER=https://clerk.your-dev-instance.example
TRADSTRY_API_URL=http://localhost:7901
MCP_BIND_ADDR=127.0.0.1:7910
```

- `MCP_PUBLIC_URL`: the origin clients reach this server at. Production is `https://mcp.tradstry.com`.
- `CLERK_ISSUER`: the Clerk instance that issues OAuth access tokens. Signing keys load from its `/.well-known/jwks.json` at startup.
- `TRADSTRY_API_URL`: the backend origin, without `/graphql`.
- `MCP_BIND_ADDR`: defaults to `0.0.0.0:7900`.

## Endpoints

| Path | Purpose |
| --- | --- |
| `/mcp` | Streamable HTTP MCP endpoint; requires a Clerk OAuth access token |
| `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` | RFC 9728 metadata pointing clients at Clerk |
| `/health` | Liveness |

## Development

```bash
cd microservice/tradstry-mcp
go run .
go test -race ./...
go vet ./...
govulncheck ./...
```

The module pins `toolchain go1.27.2`, which fixes standard-library vulnerabilities the server reaches in 1.27.1.
