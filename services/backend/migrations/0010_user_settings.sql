-- Preferences that change how a user's results are measured and shown.
CREATE TABLE user_settings (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Dollars at risk assumed for a trade with no stop or planned risk.
    default_risk numeric CHECK (default_risk > 0),
    -- Trades whose net is within this many dollars of zero count as breakeven.
    breakeven_band numeric NOT NULL DEFAULT 0 CHECK (breakeven_band >= 0),
    time_zone text NOT NULL DEFAULT 'local' CHECK (time_zone IN ('market', 'local')),
    week_start text NOT NULL DEFAULT 'sunday' CHECK (week_start IN ('sunday', 'monday')),
    default_period text NOT NULL DEFAULT '1m'
        CHECK (default_period IN ('today', '1w', '1m', '3m', '6m', 'ytd', '1y', 'all')),
    updated_at timestamptz NOT NULL DEFAULT now()
);
