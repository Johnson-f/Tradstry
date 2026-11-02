-- Every write a user could see announces itself on the `tradstry_changes`
-- channel as {"u": user, "w": workspace or null, "t": topic}, so open apps
-- refresh in real time whichever code path made the change. Triggers run once
-- per statement over its transition table, and Postgres delivers identical
-- notifications from one transaction once, on commit, so a rebuild that
-- rewrites thousands of rows sends one message per workspace.

CREATE FUNCTION notify_user_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('tradstry_changes', json_build_object('u', user_id, 'w', NULL, 't', TG_ARGV[0])::text)
    FROM (SELECT DISTINCT user_id FROM changed) AS users;
    RETURN NULL;
END
$$;

CREATE FUNCTION notify_workspace_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('tradstry_changes', json_build_object('u', user_id, 'w', workspace_id, 't', TG_ARGV[0])::text)
    FROM (SELECT DISTINCT user_id, workspace_id FROM changed) AS workspaces;
    RETURN NULL;
END
$$;

-- For brokerage rows that only know their account.
CREATE FUNCTION notify_account_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('tradstry_changes', json_build_object('u', user_id, 'w', workspace_id, 't', TG_ARGV[0])::text)
    FROM (
        SELECT DISTINCT a.user_id, w.id AS workspace_id
        FROM (SELECT DISTINCT account_id FROM changed) AS c
        JOIN brokerage_accounts a ON a.id = c.account_id
        LEFT JOIN workspaces w ON w.brokerage_account_id = a.id
    ) AS owners;
    RETURN NULL;
END
$$;

DO $$
DECLARE
    watched record;
    event text;
BEGIN
    FOR watched IN
        SELECT * FROM (VALUES
            ('trades', 'notify_workspace_change', 'trades'),
            ('trade_engine_state', 'notify_user_change', 'trades'),
            ('trade_decisions', 'notify_workspace_change', 'trades'),
            ('manual_fills', 'notify_workspace_change', 'trades'),
            ('opening_positions', 'notify_workspace_change', 'trades'),
            ('instrument_aliases', 'notify_user_change', 'trades'),
            ('trade_annotations', 'notify_workspace_change', 'journal'),
            ('journal_labels', 'notify_user_change', 'labels'),
            ('trade_plans', 'notify_workspace_change', 'plans'),
            ('user_settings', 'notify_user_change', 'settings'),
            ('workspaces', 'notify_user_change', 'workspaces'),
            ('brokerage_connections', 'notify_user_change', 'brokerage'),
            ('brokerage_accounts', 'notify_user_change', 'brokerage'),
            ('sync_jobs', 'notify_account_change', 'brokerage'),
            ('brokerage_activities', 'notify_account_change', 'brokerage'),
            ('brokerage_orders', 'notify_account_change', 'brokerage'),
            ('brokerage_snapshots', 'notify_account_change', 'brokerage')
        ) AS t (relation, function_name, topic)
    LOOP
        -- A trigger with a transition table can only fire on one kind of event.
        FOREACH event IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
            EXECUTE format(
                'CREATE TRIGGER %I AFTER %s ON %I REFERENCING %s TABLE AS changed
                 FOR EACH STATEMENT EXECUTE FUNCTION %I(%L)',
                watched.relation || '_notify_' || lower(event),
                event,
                watched.relation,
                CASE event WHEN 'DELETE' THEN 'OLD' ELSE 'NEW' END,
                watched.function_name,
                watched.topic
            );
        END LOOP;
    END LOOP;
END
$$;
