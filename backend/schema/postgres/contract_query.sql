WITH managed_tables AS (
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relkind = 'r'
      AND c.relname NOT IN (
          'price_history',
          'price_fetch_failures',
          'account_equity_rebuild',
          'paddle_webhook_events',
          'brokerage_transactions_dedup_archive',
          '_sqlx_migrations',
          'seaql_migrations'
      )
),
columns AS (
    SELECT t.relname AS table_name,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           a.attgenerated::text AS generated,
           (a.attidentity <> '' OR pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%') AS auto_increment,
           CASE
               WHEN pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%' THEN NULL
               ELSE replace(pg_get_expr(d.adbin, d.adrelid), quote_ident(current_schema()) || '.', '')
           END AS default_expr
    FROM managed_tables t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
),
constraints AS (
    SELECT t.relname AS table_name,
           c.contype::text AS constraint_type,
           replace(pg_get_constraintdef(c.oid, true), quote_ident(current_schema()) || '.', '') AS definition
    FROM managed_tables t
    JOIN pg_constraint c ON c.conrelid = t.oid
),
indexes AS (
    SELECT t.relname AS table_name,
           i.relname AS index_name,
           replace(pg_get_indexdef(i.oid), quote_ident(current_schema()) || '.', '') AS definition
    FROM managed_tables t
    JOIN pg_index x ON x.indrelid = t.oid
    JOIN pg_class i ON i.oid = x.indexrelid
    LEFT JOIN pg_constraint c ON c.conindid = i.oid AND c.contype IN ('p', 'u', 'x')
    WHERE c.oid IS NULL
),
functions AS (
    SELECT p.proname AS function_name,
           replace(pg_get_functiondef(p.oid), quote_ident(current_schema()) || '.', '') AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = current_schema()
),
triggers AS (
    SELECT t.relname AS table_name,
           g.tgname AS trigger_name,
           replace(pg_get_triggerdef(g.oid, true), quote_ident(current_schema()) || '.', '') AS definition
    FROM managed_tables t
    JOIN pg_trigger g ON g.tgrelid = t.oid
    WHERE NOT g.tgisinternal
)
SELECT jsonb_build_object(
    'tables', COALESCE((
        SELECT jsonb_agg(relname ORDER BY relname) FROM managed_tables
    ), '[]'::jsonb),
    'columns', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name, column_name) FROM columns c
    ), '[]'::jsonb),
    'constraints', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name, constraint_type, definition) FROM constraints c
    ), '[]'::jsonb),
    'indexes', COALESCE((
        SELECT jsonb_agg(to_jsonb(i) ORDER BY table_name, index_name) FROM indexes i
    ), '[]'::jsonb),
    'functions', COALESCE((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY function_name, definition) FROM functions f
    ), '[]'::jsonb),
    'triggers', COALESCE((
        SELECT jsonb_agg(to_jsonb(t) ORDER BY table_name, trigger_name) FROM triggers t
    ), '[]'::jsonb),
    'extensions', (
        SELECT jsonb_agg(extname ORDER BY extname)
        FROM pg_extension
        WHERE extname IN ('pg_trgm', 'vector')
    )
) AS contract;
