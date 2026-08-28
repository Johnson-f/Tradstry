\set ON_ERROR_STOP on

WITH settings AS (
    SELECT :'support_schema'::text AS schema_name
),
managed_tables AS (
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN settings s
    WHERE n.nspname = s.schema_name
      AND c.relkind = 'r'
      AND c.relname NOT IN (
          'price_history',
          'price_fetch_failures',
          'account_equity_rebuild',
          'paddle_webhook_events',
          'brokerage_transactions_dedup_archive'
      )
),
ddl AS (
    SELECT 0::bigint AS sort_key, '-- Generated from the current PostgreSQL catalog. Do not edit this baseline after release.'::text AS statement
    UNION ALL SELECT 1, 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
    UNION ALL SELECT 2, 'CREATE EXTENSION IF NOT EXISTS vector;'
    UNION ALL SELECT 10, 'ALTER TABLE agent_knowledge_passages ADD COLUMN IF NOT EXISTS embedding halfvec(2048);'
    UNION ALL SELECT 11, 'ALTER TABLE agent_knowledge_passages ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector(''english'', search_text)) STORED;'
    UNION ALL SELECT 12, 'ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS embedding halfvec(2048);'
    UNION ALL SELECT 13, 'ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector(''english'', text)) STORED;'
    UNION ALL SELECT 20, 'CREATE SEQUENCE IF NOT EXISTS notebook_note_updates_seq_seq OWNED BY notebook_note_updates.seq;'
    UNION ALL SELECT 21, 'ALTER TABLE notebook_note_updates ALTER COLUMN seq SET DEFAULT nextval(''notebook_note_updates_seq_seq''::regclass);'
    UNION ALL
    SELECT 100 + row_number() OVER (ORDER BY t.relname, a.attname),
           format(
               'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s;',
               t.relname,
               a.attname,
               replace(pg_get_expr(d.adbin, d.adrelid), quote_ident(s.schema_name) || '.', '')
           )
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    JOIN managed_tables t ON t.oid = d.adrelid
    CROSS JOIN settings s
    WHERE a.attgenerated = ''
      AND pg_get_expr(d.adbin, d.adrelid) NOT LIKE 'nextval(%'
    UNION ALL
    SELECT 1000 + row_number() OVER (ORDER BY t.relname, c.conname),
           format(
               'DO $support$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = %L::regclass AND conname = %L) THEN ALTER TABLE %I ADD CONSTRAINT %I %s; END IF; END $support$;',
               t.relname,
               c.conname,
               t.relname,
               c.conname,
               replace(pg_get_constraintdef(c.oid, true), quote_ident(s.schema_name) || '.', '')
           )
    FROM pg_constraint c
    JOIN managed_tables t ON t.oid = c.conrelid
    CROSS JOIN settings s
    WHERE c.contype = 'c'
    UNION ALL
    SELECT 5000 + row_number() OVER (ORDER BY t.relname, c.conname),
           format(
               'DO $support$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = %L::regclass AND contype = ''f'' AND pg_get_constraintdef(oid, true) = %L) THEN ALTER TABLE %I ADD CONSTRAINT %I %s; END IF; END $support$;',
               t.relname,
               replace(pg_get_constraintdef(c.oid, true), quote_ident(s.schema_name) || '.', ''),
               t.relname,
               c.conname,
               replace(pg_get_constraintdef(c.oid, true), quote_ident(s.schema_name) || '.', '')
           )
    FROM pg_constraint c
    JOIN managed_tables t ON t.oid = c.conrelid
    CROSS JOIN settings s
    WHERE c.contype = 'f'
    UNION ALL
    SELECT 6000 + row_number() OVER (ORDER BY t.relname, c.conname),
           format(
               'DO $support$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = %L::regclass AND contype = ''u'' AND pg_get_constraintdef(oid, true) = %L) THEN ALTER TABLE %I ADD CONSTRAINT %I %s; END IF; END $support$;',
               t.relname,
               replace(pg_get_constraintdef(c.oid, true), quote_ident(s.schema_name) || '.', ''),
               t.relname,
               c.conname,
               replace(pg_get_constraintdef(c.oid, true), quote_ident(s.schema_name) || '.', '')
           )
    FROM pg_constraint c
    JOIN managed_tables t ON t.oid = c.conrelid
    CROSS JOIN settings s
    WHERE c.contype = 'u'
    UNION ALL SELECT 1911, 'ALTER TABLE agent_conversation_summary_jobs DROP CONSTRAINT IF EXISTS agent_conversation_summary_jobs_conversation_id_key;'
    UNION ALL SELECT 1912, 'ALTER TABLE notebook_folders DROP CONSTRAINT IF EXISTS notebook_folders_workspace_id_key;'
    UNION ALL SELECT 1913, 'ALTER TABLE tag_categories DROP CONSTRAINT IF EXISTS tag_categories_user_id_key;'
    UNION ALL SELECT 1914, 'ALTER TABLE trade_episode_matches DROP CONSTRAINT IF EXISTS trade_episode_matches_episode_id_key;'
    UNION ALL SELECT 1915, 'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_paddle_subscription_id_key;'
    UNION ALL SELECT 1916, 'ALTER TABLE market_watchlists DROP CONSTRAINT IF EXISTS market_watchlists_workspace_id_key;'
    UNION ALL SELECT 1900, 'DO $support$ DECLARE item record; BEGIN FOR item IN SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE ''idx-%'' LOOP EXECUTE format(''DROP INDEX IF EXISTS %I'', item.indexname); END LOOP; END $support$;'
    UNION ALL
    SELECT 3000 + row_number() OVER (ORDER BY t.relname, i.relname),
           CASE
               WHEN x.indisunique AND (x.indpred IS NOT NULL OR x.indexprs IS NOT NULL)
               THEN format('DROP INDEX IF EXISTS %I;%s%s;', i.relname, E'\n', regexp_replace(
                   replace(pg_get_indexdef(i.oid), quote_ident(s.schema_name) || '.', ''),
                   '^CREATE (UNIQUE )?INDEX ',
                   'CREATE \1INDEX IF NOT EXISTS '
               ))
               ELSE regexp_replace(
                   replace(pg_get_indexdef(i.oid), quote_ident(s.schema_name) || '.', ''),
                   '^CREATE (UNIQUE )?INDEX ',
                   'CREATE \1INDEX IF NOT EXISTS '
               ) || ';'
           END
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN managed_tables t ON t.oid = x.indrelid
    LEFT JOIN pg_constraint c ON c.conindid = i.oid AND c.contype IN ('p', 'u', 'x')
    CROSS JOIN settings s
    WHERE c.oid IS NULL
    UNION ALL
    SELECT 7000 + row_number() OVER (ORDER BY p.proname, p.oid),
           rtrim(replace(pg_get_functiondef(p.oid), quote_ident(s.schema_name) || '.', ''), E'\n') || ';'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN settings s
    WHERE n.nspname = s.schema_name
    UNION ALL
    SELECT 8000 + row_number() OVER (ORDER BY t.relname, g.tgname),
           format(
               'DROP TRIGGER IF EXISTS %I ON %I;%s%s;',
               g.tgname,
               t.relname,
               E'\n',
               replace(pg_get_triggerdef(g.oid, true), quote_ident(s.schema_name) || '.', '')
           )
    FROM pg_trigger g
    JOIN managed_tables t ON t.oid = g.tgrelid
    CROSS JOIN settings s
    WHERE NOT g.tgisinternal
)
SELECT statement
FROM ddl
ORDER BY sort_key;
