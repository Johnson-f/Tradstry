# SnapTrade OAuth operations

Tradstry supports SnapTrade Personal OAuth alongside the existing Commercial
connection flow. Commercial users are not migrated automatically.

## Registration

Register exact backend callback URLs in the matching SnapTrade environment:

- Test: `http://localhost:7899/oauth/snaptrade/callback`
- Production: `https://backend.tradstry.com/oauth/snaptrade/callback`

Confirm the Production URL is reachable over TLS before registering it. The
OAuth client secret is shown once. Store it only as
`SNAPTRADE_OAUTH_CLIENT_SECRET` in the private Go adapter environment.

The adapter also needs `SNAPTRADE_OAUTH_CLIENT_ID`. The Rust backend needs:

- `SNAPTRADE_OAUTH_REDIRECT_URI`
- `SNAPTRADE_OAUTH_FRONTEND_RETURN_URL`
- the existing `BROKERAGE_ENCRYPTION_KEY`

If the two backend OAuth URLs are absent, OAuth is disabled and the UI exposes
only the existing Commercial connection path.

## Test flow

Use a separate SnapTrade Personal test identity with Personal OAuth enabled.
Connect Sandbox or a test brokerage in SnapTrade before authorizing Tradstry.

Verify approval, denial, multiple accounts, one-year/custom/all import windows,
webhooks, a rotated refresh token, reconnect-required state, workspace unlink,
and full grant revocation. Revocation must remove Tradstry access while leaving
the Personal brokerage connection visible in SnapTrade.

## Rollout and rollback

Enable OAuth first for Test and internal users. Keep Commercial available. To
disable new OAuth attempts, remove both backend OAuth URL variables and restart
the backend. Existing grants remain encrypted and inactive from the UI; do not
delete them during rollback. Restore the variables to resume, or let users
explicitly revoke access.

Never log or export client secrets, authorization codes, access tokens, refresh
tokens, raw state, or PKCE verifiers.
