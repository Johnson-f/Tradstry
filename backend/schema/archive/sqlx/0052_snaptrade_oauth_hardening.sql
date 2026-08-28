ALTER TABLE snaptrade_oauth_attempts
    ADD COLUMN intent TEXT NOT NULL DEFAULT 'connect';

ALTER TABLE snaptrade_oauth_attempts
    ADD CONSTRAINT snaptrade_oauth_attempts_intent_check
        CHECK (intent IN ('connect', 'reauthorize'));

UPDATE snaptrade_oauth_grants
SET access_token_encrypted = NULL,
    refresh_token_encrypted = NULL,
    access_token_expires_at = NULL
WHERE status <> 'active';

ALTER TABLE snaptrade_oauth_grants
    DROP CONSTRAINT snaptrade_oauth_grants_active_credentials_check;

ALTER TABLE snaptrade_oauth_grants
    ADD CONSTRAINT snaptrade_oauth_grants_credentials_check CHECK (
        (
            status = 'active'
            AND snaptrade_user_id IS NOT NULL
            AND access_token_encrypted IS NOT NULL
            AND refresh_token_encrypted IS NOT NULL
            AND access_token_expires_at IS NOT NULL
            AND authorized_at IS NOT NULL
        )
        OR (
            status <> 'active'
            AND access_token_encrypted IS NULL
            AND refresh_token_encrypted IS NULL
            AND access_token_expires_at IS NULL
        )
    );
