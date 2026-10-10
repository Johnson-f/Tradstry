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
| `brokerage/` | Connecting, setting up, syncing and disconnecting a broker through SnapTrade |
| `journal/` | Starting the journal, listing trades, recording context, reviewing trades, fixing grouping, and resolving possible duplicates |
| `analytics/` | `get_performance`, `get_daily_pnl`, `get_breakdown`, `get_mistake_costs` |
| `playbooks/` | `list_playbooks`, `get_playbook`, `create_playbook`, `update_playbook`, `set_playbook_workspaces`, `delete_playbook` |
| `calculator/` | `get_risk_rules`, `set_risk_rules`, `calculate_position`, `save_calculation`, `create_position_plan`, `list_position_plans`, `update_position_plan`, `delete_position_plan`, `list_calculator_history`, `delete_calculator_entry` |
| `tags/` | `list_tags`, `create_tag`, `update_tag`, `merge_tags`, `delete_tag`, `create_tag_category`, `update_tag_category`, `move_tag_category`, `set_tag_category_workspaces`, `delete_tag_category` |
| `principles/` | `list_principles`, `create_principle`, `update_principle`, `move_principle`, `delete_principle` |
| `notebook/` | Reading, searching, writing and organising notes and folders, viewing note images, and restoring deleted notes |
| `mcptest/` | Test support: the real server in front of a fake Tradstry API |
| `gqlcheck/` | Test support: validates GraphQL operations against `backend/schema/graphql/schema.graphql` |

## Connecting a broker

SnapTrade's connection portal runs in the user's browser, so connecting takes three steps:

1. `connect_brokerage` asks the backend for a portal link whose return address is this server's `/brokerage/connected` page, tagged with a random one-time `state`.
2. After the user signs in to their broker, SnapTrade sends the browser to that page with the outcome. The page records it and tells the user to go back to the chat.
3. `finish_brokerage_connection` completes the connection with the user's own token (the backend checks the connection belongs to them), and `set_up_brokerage_accounts` imports the accounts and history the user chooses, then runs the first sync.

Visits in progress are kept in memory for 30 minutes. A restart only means the user starts again.

The backend only lets the portal return to origins it trusts, so its `SNAPTRADE_PORTAL_REDIRECT_ORIGINS` must include this server's `MCP_PUBLIC_URL` origin.

Users who already have a SnapTrade Personal account can pass `method: "snaptrade_account"` instead. That uses SnapTrade OAuth: the backend handles SnapTrade's callback and records the outcome itself, then sends the browser to this server's `/brokerage/snaptrade-authorized` page. A broken link is always repaired the way it was made. This needs `SNAPTRADE_OAUTH_MCP_RETURN_URL` set on the backend (see `backend/SNAPTRADE_OAUTH.md`); without it the tool tells the assistant to use the broker login instead.

## Manual trades

Traders without a connected broker record trades with `add_manual_trade`, correct them with `update_manual_trade` and remove them with `delete_manual_trade` (after the user approves). These work whether or not the journal is on.

- **Retries:** the trade's id is a hash of the details sent, so a retried call returns the trade already recorded. Two genuinely identical trades need a different time to be recorded twice.
- **Edits** send only the fields the user corrected, with the version they read. If another device saved in between, the tool re-reads and tries once more.
- **Fees** are optional. Left out, they are unknown and the trade's result is before fees; 0 means there were none. The answer says which.
- A manual trade that overlaps a broker trade is held as a possible duplicate, and the answer says so.

## Journal writes

The backend's journal writes need version checks and an idempotency key. The tools handle both, so the assistant never sees them.

- **Versions:** each write reads the current versions just before saving. If another device saved in between, the tool re-reads and tries once more, keeping that device's change.
- **Retries:** each write's `mutationId` is a hash of the tool, its input and the state it read. A retried call replays the stored result instead of writing twice, while the same input after the state moved is a new write.
- **What stays the user's:** the takeaway, stop, plan timing and the "account was flat" answer. A flat answer of yes goes through the same confirmation as deleting a workspace.
- **Grouping:** every change is previewed first; previews change nothing. `confirm_grouping_change` shows the user the previewed before-and-after and applies it only once they approve. Merges send every execution the trades hold, adding up an execution two trades share, so no quantity is lost.

## Analytics

The analytics tools are read-only and take a period: a preset such as `this_month` or `last_30_days` (the default), a `month` like `2026-09`, or `from`/`to` dates. Periods are whole days in the journal's time zone, which is also how the backend groups days. Trading sessions use New York time.

Every answer states its period, currency and coverage, which comes from the backend with the figures: how many trades were counted and how many of them were entered by hand, plus the open positions and the trades waiting for the user. The backend counts the same trades for every report, so chat, the dashboard, the calendar and the analytics page agree, with the journal on or off. Broker results are net of fees; manual results are before fees, and the answer says when manual trades are included.

- **R multiples** use the stop in place when each trade opened: the latest stop committed before entry, from a position-calculator plan or the journal, or else the first one set while the trade was open. Stops set after the close never count. The dashboard uses the same rule. The answer says how many trades that covers, how many rely on a stop typed with a manual trade (whose timing is unknown), or why R is unknown; it is never reported as zero.
- **Mistake costs** list mistake tags and violated principles worst first. A figure is what those trades netted, not money the mistake itself lost.
- **Daily P&L** covers at most 92 days so answers stay short; longer questions use `get_performance` or `get_breakdown`.
- **Possible duplicates.** A manual trade that overlaps a broker trade is held out of every total until the user decides. `list_trades` shows which broker trades it may repeat, and `resolve_possible_duplicate` either previews merging it into the broker trade (keeping the user's notes, confirmed with `confirm_grouping_change`) or, after the user approves, keeps it as a separate trade.

## Notebook

Notes are read and written as Tradstry Markdown: Markdown with tables, `- [ ]` check lists and `---` dividers, plus `![alt](media:<hash>)` for a note's image or video, `[label](trade:<id>)` for a trade chip and a ```` ```trades <label> ```` block of trade IDs for a trade table. The backend's projector does every conversion.

- **Edits change only what differs.** Every write becomes the note's new Markdown, and the backend rewrites only the blocks that changed. Untouched blocks keep formatting Markdown cannot express, such as underline, alignment and image size, and the user can type elsewhere in the note at the same time.
- **Nothing is lost silently.** A block Markdown cannot carry is shown as a `<!-- tradstry:keep … -->` line; leaving it keeps the block exactly. An edit that drops formatting from a rewritten block reports it in `formatting_lost`.
- **Revisions.** `get_note` returns a revision. `edit_note` and `rewrite_note` send it, and the backend refuses with a conflict if the note changed since. `edit_note` re-reads and retries once when every `old_text` still matches; `rewrite_note` never retries.
- **Deletes** are confirmed like workspace deletes, and a deleted note can be restored for 30 days.
- **Images** are fetched from `/notebook/media/{hash}` with the user's token. Anything over 5 MB, and every video, is shown as its thumbnail.

## Position sizing

`calculate_position` sizes a trade the way the web calculator does: the risk budget is the balance times the risk percent, each entry gets its share, and shares round down to two decimals (or whole shares) so a stop-out never loses more than planned. The balance is the one given, else the broker's, else the saved rule's. Plans made with `create_position_plan` are what the journal matches to trades, so their stop gives those trades an R. When every entry of a plan is filled or skipped, the plan completes into the calculator's history, or is cancelled if nothing filled, as on the web. Options plans are read-only here.

## Rate limits

Each user's tool calls are limited in Redis with the same token bucket the Rust server uses: 60 calls at once, then one a second. Tools that change or delete data also draw on a second bucket of 20, refilling at 20 a minute. A limited call returns a tool error telling the assistant how long to wait, and never reaches the Tradstry API. If Redis cannot be reached, calls go ahead and the error is logged.

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
REDIS_URL=redis://localhost:6379
```

- `MCP_PUBLIC_URL`: the origin clients reach this server at. Production is `https://mcp.tradstry.com`.
- `CLERK_ISSUER`: the Clerk instance that issues OAuth access tokens. Signing keys load from its `/.well-known/jwks.json` at startup.
- `TRADSTRY_API_URL`: the backend origin, without `/graphql`.
- `MCP_BIND_ADDR`: defaults to `0.0.0.0:7900`.
- `MCP_REQUIRE_AUDIENCE`: `false` by default. A token that names an audience must always name this server (`MCP_PUBLIC_URL` or `MCP_PUBLIC_URL/mcp`). Set `true` to also refuse tokens that name none, after turning on "Include Audience" for OAuth applications in Clerk; until then, each such token is logged.
- `REDIS_URL`: where rate limits are counted, shared by every copy of the server. In production use the Compose Redis with its password, `redis://:<REDIS_PASSWORD>@redis:6379`.

## Endpoints

| Path | Purpose |
| --- | --- |
| `/mcp` | Streamable HTTP MCP endpoint; requires a Clerk OAuth access token |
| `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` | RFC 9728 metadata pointing clients at Clerk |
| `/brokerage/connected` | Page SnapTrade's connection portal returns the browser to |
| `/brokerage/snaptrade-authorized` | Page the backend sends the browser to after SnapTrade OAuth |
| `/health` | Liveness |

## Deployment

`devops/docker/mcp.Dockerfile` builds a static binary on Alpine, run as a non-root user with a `/health` check. Compose runs it as `mcp-server` (container `tradstry-mcp`) on `tradstry-network`, where Caddy serves it at `mcp.tradstry.com`. It reaches the backend at `http://backend:7899` and Redis with the Compose `REDIS_PASSWORD`; it holds no database or storage credentials. The backend's Compose environment sets `SNAPTRADE_PORTAL_REDIRECT_ORIGINS` and `SNAPTRADE_OAUTH_MCP_RETURN_URL` to this server so broker connections return to it.

## Development

```bash
cd microservice/tradstry-mcp
go run .
go test -race ./...
go vet ./...
govulncheck ./...
```

Every GraphQL operation is validated against the backend's exported schema, both directly in each feature's `schema_test.go` and for every request the fake API receives in tool tests. After changing the backend's GraphQL, regenerate the schema (see `backend/README.md`) and rerun these tests.

The module pins `toolchain go1.27.2`, which fixes standard-library vulnerabilities the server reaches in 1.27.1.
