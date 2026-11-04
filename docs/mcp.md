# MCP server

Tradstry is a remote MCP server for ChatGPT, Claude (claude.ai, Desktop, mobile and Claude Code) and any other MCP client.

It is served by the backend at `{MCP_PUBLIC_URL}/mcp`, which is `https://mcp.tradstry.com/mcp` in production. Users sign in with their Tradstry account through Stytch Connected Apps. The code is in `backend/src/mcp/`, and the design and its research are in `docs/plans/2026-11-02-feature-mcp-server-plan.md`.

## Connecting

| Client | How |
| --- | --- |
| Claude Code | `claude mcp add --transport http tradstry {MCP_PUBLIC_URL}/mcp`, then `/mcp` → tradstry → Authenticate |
| claude.ai, Desktop, mobile | Settings → Connectors → Add custom connector, URL `{MCP_PUBLIC_URL}/mcp` (needs a public HTTPS URL) |
| ChatGPT | Settings → Apps → Developer mode → Create app, URL `{MCP_PUBLIC_URL}/mcp`, authentication OAuth (public HTTPS URL) |

Locally, `make backend` serves `http://localhost:7900/mcp` when `STYTCH_ISSUER` is set. Claude Code works against that directly. claude.ai and ChatGPT need a public HTTPS tunnel, with `MCP_PUBLIC_URL` set to the tunnel's origin.

## Sign-in

1. **Discovery.** A call without a token gets `401` with `WWW-Authenticate: Bearer resource_metadata="…", scope="tradstry:read"`.
   - The protected resource metadata is served at both `/.well-known/oauth-protected-resource` and `…/mcp`.
   - It names the Stytch custom domain (`STYTCH_ISSUER`) as the only authorization server.
2. **Registration.** The client registers with Stytch, by Client ID Metadata Document where it can and by Dynamic Client Registration otherwise.
3. **Consent.** It sends the user to the website's `/oauth/authorize` page, which uses Stytch's headless consent calls.
4. **Every request.** Each MCP request must carry a Stytch Connected App access token. The backend checks it locally against Stytch's keys. The token must:
   - be issued by the custom domain;
   - name the project ID in `aud` (Stytch does not add the MCP URL);
   - be a Connected App token, not a website session token;
   - carry `tradstry:read`;
   - belong to an existing Tradstry account.
5. **Writes.** `journal_trade`, `save_plan` and `link_plan` also need `tradstry:write`.
   - Without it, the call gets `403` with `error="insufficient_scope", scope="tradstry:read tradstry:write"`, so Claude can ask for more permission.
   - The tool result repeats the challenge in `_meta["mcp/www_authenticate"]`, which ChatGPT reads.
   - Each tool lists its scopes in `_meta.securitySchemes`.

Stytch grants a scope only when the user's role covers it. Every new account gets the `trader` role (`trading:read` and `trading:write`) when it is created.

## Tools

| Tool | For | Writes |
| --- | --- | --- |
| `get_overview` | P&L, win rate, expectancy, profit factor, drawdown and streaks for a period | |
| `review_period` | A full review: best and worst trades, leaks, strengths, mistake costs, behavior, unjournaled trades | |
| `analyze` | Results grouped by edge, entry tactic, tag, mistake, symbol, session, weekday, hold time, size, R, behavior fields or plan | |
| `find_trades` | Search by symbol, open dates, status, winners or losers, and label name | |
| `get_trade` | One trade: fills, note text, labels, behavior, risk and R, linked plan | |
| `open_positions` | Open positions with the latest price and unrealised P&L | |
| `list_plans` | Trade plans by status | |
| `size_position` | Position size from entry or entries, stop and risk (dollars, percent, rule or default) | |
| `journal_trade` | Appends a note; adds labels by name; sets behavior, stop or planned risk | ✓ |
| `save_plan` | Saves a sized plan | ✓ |
| `link_plan` | Links a plan to the trade that carried it out; the trade takes the plan's stop and risk | ✓ |

Every tool returns structured content plus a short summary written for the assistant. Periods are the dashboard's: `today`, `1w`, `1m`, `3m`, `6m`, `ytd`, `1y` and `all`, in whole New York trading days.

Writes never remove anything the trader wrote:
- notes are appended to, never replaced;
- labels are added, never taken away;
- the journal entry's version is checked, so a save never overwrites one made on another device.

The prompts are `weekly_review`, `premarket_plan` and `trade_postmortem`.

## Adding a tool

1. Add `src/mcp/tools/<name>.rs`. In it, write an `impl TradstryMcp` block marked `#[tool_router(router = <name>_router, vis = "pub(super)")]`, with one `#[tool]` method.
   - Mark it `meta = reads()` or `meta = writes()`.
   - Give it honest `annotations`.
2. Register the module and add `Self::<name>_router()` in `tools/mod.rs`.
3. If it writes, add it to `WRITE_TOOLS` and call `self.require_write(caller)` first.
4. Cover it in `tests/mcp.rs`.

## Deploying

The release pipeline and server are in `docs/deploy.md`. What MCP needs on top:

- **DNS and proxy:** point `mcp.tradstry.com` at the backend. `deploy/Caddyfile` already proxies it.
  - Set `MCP_PUBLIC_URL=https://mcp.tradstry.com` and `STYTCH_ISSUER` to the custom domain.
  - The host from `MCP_PUBLIC_URL` is added to rmcp's allowed `Host` list. Any other host is refused.
- **Stytch Connected Apps (production project):**
  - set the Authorization URL to `https://tradstry.com/oauth/authorize`;
  - turn on DCR and CIMD;
  - allow the scopes `openid email profile offline_access tradstry:read tradstry:write`;
  - set up the RBAC resource `trading`, the two custom scopes and the `trader` role as in test.
- **Network:** Anthropic connects from `160.79.104.0/21`, and ChatGPT from OpenAI's connector ranges. Don't put a WAF in front of `/mcp` or `/.well-known/*` that blocks them.
- **Response times:** Claude allows 10 seconds for discovery. The metadata routes are static, and the token endpoints are Stytch's.
