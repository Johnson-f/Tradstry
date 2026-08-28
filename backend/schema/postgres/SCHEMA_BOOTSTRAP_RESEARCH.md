# PostgreSQL schema bootstrap and pooled connections

## Conclusion

Create the environment schema before constructing the application pool. Then configure `search_path` for every pooled connection. Keeping `CREATE SCHEMA IF NOT EXISTS` inside SQLx `after_connect` is valid, but it repeats database-wide setup for every new connection and produces the observed notices.

There was no existing research-note convention in this repository, so this note lives beside the PostgreSQL schema artifacts it discusses.

## What the sources explicitly say

- PostgreSQL `CREATE SCHEMA IF NOT EXISTS` does nothing when the schema exists **except issue a notice**. Creating a schema requires `CREATE` privilege on the database. [PostgreSQL: `CREATE SCHEMA`](https://www.postgresql.org/docs/current/sql-createschema.html)
- `search_path` decides how unqualified object names resolve. The first valid schema is also where unqualified new objects are created. PostgreSQL documents `SET search_path TO my_schema, public`. [PostgreSQL: schemas and search path](https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATH)
- Regular `SET` affects only the current database session and lasts until that session ends unless changed. [PostgreSQL: `SET`](https://www.postgresql.org/docs/current/sql-set.html)
- SQLx runs `after_connect` after a new connection is opened, including connections created to maintain `min_connections`. Its own PostgreSQL example uses this hook for `SET search_path`. [SQLx: `PoolOptions::after_connect`](https://docs.rs/sqlx/0.9.0/sqlx/pool/struct.PoolOptions.html#method.after_connect)
- SQLx `PgConnectOptions::options` can send configuration values as connection startup options. PostgreSQL's `options` connection parameter applies `-c` settings at connection start. [SQLx: `PgConnectOptions::options`](https://docs.rs/sqlx/0.9.0/sqlx/postgres/struct.PgConnectOptions.html#method.options), [PostgreSQL: connection parameter `options`](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNECT-OPTIONS)

## Engineering inference

The clean lifecycle is:

1. Open one bootstrap connection.
2. Run `CREATE SCHEMA IF NOT EXISTS` once per process startup.
3. Build the pool with `search_path` applied to every new connection, either through `PgConnectOptions::options` or SQLx `after_connect`.
4. Run migrations and schema checks through that configured pool.

Because every physical pool connection is its own PostgreSQL session, each needs the same `search_path`. Startup options are the leanest choice because they avoid an extra `SET` query for each connection. `after_connect` remains an officially documented and correct SQLx approach when code-based session setup is clearer.

If several application instances start together, each can still perform the one bootstrap statement. PostgreSQL documents the statement's existing-schema behavior, but does not promise a globally single execution; provisioning the schema outside application startup is stricter when production roles should not have database-level `CREATE` privilege.

## Security constraint

Only schemas controlled by trusted roles should appear in `search_path`. PostgreSQL warns that placing a schema in the path effectively trusts anyone with `CREATE` privilege on that schema. [PostgreSQL: schema search-path security](https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATH)
