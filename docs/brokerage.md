# Brokerage linking (SnapTrade)

Tradstry reads brokerage accounts through SnapTrade in two ways:

- **Connect a brokerage** (Commercial API key). Tradstry registers a SnapTrade user for each Tradstry user and opens the Connection Portal. Data calls are signed with the consumer key.
- **Continue with SnapTrade** (OAuth app). A user who already has a SnapTrade Personal account shares it with Tradstry. Data calls use that user's bearer token.

Each imported brokerage account gets its own workspace. Users can also create manual workspaces.

## Running locally

1. `docker compose up -d` in `services/backend` starts Postgres. Migrations run when the backend starts.
2. Copy `services/backend/.env.example` to `.env` and fill in:
   - the SnapTrade Test key;
   - the Test OAuth app;
   - `BROKERAGE_ENCRYPTION_KEY`.

   With no SnapTrade keys, the backend runs with brokerage linking off.
3. Register `http://localhost:7900/oauth/snaptrade/callback` on the Test OAuth app. It must exactly match `SNAPTRADE_OAUTH_REDIRECT_URI`.
4. For webhooks, point a tunnel at `http://localhost:7900/webhooks/snaptrade` and set it as the webhook URL in the SnapTrade dashboard. Webhooks are verified with the consumer key.
5. `cargo test` runs offline against a local SnapTrade fake. To check request signing against the real API, run:

   ```sh
   SNAPTRADE_CLIENT_ID=… SNAPTRADE_CONSUMER_KEY=… cargo test --test snaptrade_live -- --ignored
   ```

## What is stored

| Data | Where | Notes |
|---|---|---|
| SnapTrade user ID and user secret | `snaptrade_registrations` | Secret encrypted with AES-256-GCM |
| OAuth access and refresh tokens | `snaptrade_oauth_grants` | Encrypted; cleared when reauthorization is required or access is revoked |
| PKCE code verifier | `snaptrade_oauth_attempts` | Encrypted; attempts are cleaned up after they expire |
| Connections and accounts | `brokerage_connections`, `brokerage_accounts` | Institution, account name, masked number and type. No full account numbers. |
| Activities and orders | `brokerage_activities`, `brokerage_orders` | Typed fields plus SnapTrade's raw record |
| Holdings and balances | `brokerage_snapshots` | Raw SnapTrade responses, kept 30 days |
| Webhook events | `snaptrade_webhook_events` | Payload minus any legacy `webhookSecret`; deleted after 7 days |

Deleting a Tradstry account revokes OAuth tokens and deletes the SnapTrade user (best effort; failures are logged), then cascades every row above except webhook events, which age out.

**Data export** is not built yet. When it is, it should include:

- connection and account metadata;
- activities, orders and snapshots.

It must never include user secrets, tokens, code verifiers or webhook payloads.

Secrets never reach logs. Every type holding one has a redacting `Debug` implementation, and transport errors drop the request URL, because Commercial calls carry `userSecret` in the query string.

## Account types

One brokerage login can hold several accounts, such as a margin account, a Roth IRA and a 401(k). Each one is imported separately, into its own workspace.

SnapTrade standardises two fields:

- `kind`: only `investment` accounts are offered for import.
- `cash_or_margin`: stored as sent. Fidelity often reports `unknown`.

`raw_type` is the brokerage's own label, and SnapTrade does not standardise it. `brokerage/account_types.rs` maps it to a US account type and its tax treatment (taxable, tax-deferred or tax-free). If `raw_type` says little, the rules fall back to the account's display name.

The type is computed when read, so improving the rules reclassifies every account without a migration. There is no manual override. Labels the rules miss classify as `UNKNOWN`, the UI shows the brokerage's label instead, and the backend logs `could not classify a brokerage account type` with the institution and label. Add new labels to the rules and their table-driven tests.

## Rotating `BROKERAGE_ENCRYPTION_KEY`

There is one active key, and there is no rotation tool yet. Each value is `base64(nonce || ciphertext)`. To rotate the key:

1. Generate the new key with `openssl rand -base64 32`.
2. Stop the backend, so nothing writes or refreshes tokens while you rotate.
3. In one transaction, decrypt with the old key and re-encrypt with the new key every non-null value in:
   - `snaptrade_registrations.user_secret_encrypted`;
   - `snaptrade_oauth_grants.access_token_encrypted` and `refresh_token_encrypted`;
   - `snaptrade_oauth_attempts.code_verifier_encrypted`. These rows can simply be deleted instead, since they are short-lived.
4. Deploy with the new key, and keep the old key until you have confirmed the backend can read the rotated values.

**If the key leaks:** rotate it, then rotate the SnapTrade consumer key and OAuth client secret in the SnapTrade dashboard.

**If the key is lost:** stored secrets cannot be recovered.
- Commercial users must be reset: delete and re-register them, which unlinks their connections.
- OAuth users must authorize again.

## Production checklist

Code-side items are done:

- polling limits;
- read-only links;
- view and delete connections;
- broken-connection detection and the in-app banner;
- `429` handling;
- webhook verification.

These still need someone with dashboard access:

- [ ] **Production access.** Submit the SnapTrade Production Access Application (KYC and payment) and get a production Commercial key.
- [ ] **Broker approvals.** Request approvals for brokers that need them, such as Schwab and Fidelity. Allow 1–7 days.
- [ ] **OAuth app.** Create the Production OAuth app with redirect URI `https://<api-domain>/oauth/snaptrade/callback`. Confirm the URL is reachable over TLS before registering it.
- [ ] **Webhook URL.** Set the production webhook URL to `https://<api-domain>/webhooks/snaptrade`.
- [ ] **Secrets.** Keep `BROKERAGE_ENCRYPTION_KEY` and the SnapTrade keys only in the production secret manager.
- [ ] **Compliance.** Read SnapTrade's compliance policy and launch guide (docs.snaptrade.com/docs/launch-guide).
- [ ] **Privacy copy.** Update the privacy and security copy to describe the stored data above.
- [ ] **Dashboards.** Watch the OAuth reauthorization rate, the broken-connection count, sync lag (`sync_jobs.due_at` against now) and the `429` rate.
- [ ] **Pricing.** Re-check OAuth pricing when SnapTrade ends the preview.
