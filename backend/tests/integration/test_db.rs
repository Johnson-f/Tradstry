//! A private Postgres database for each test.
//!
//! The first test to run builds a template database on the current schema. It is
//! named after a hash of everything that defines the schema, so later runs reuse
//! it until a migration, entity or bootstrap change. Each test then gets its own
//! copy (`CREATE DATABASE ... TEMPLATE`), so tests never share rows or wait on
//! each other's schema changes.
//!
//! A test's database is dropped when the test passes and kept when it fails, so
//! its data can be inspected. Databases left from earlier runs are removed after
//! a day. Only databases with this module's prefixes are ever created or dropped.

use std::path::Path;
use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Connection, PgConnection, PgPool};
use tokio::runtime::RuntimeFlavor;
use tokio::sync::OnceCell;

const DEFAULT_URL: &str = "postgres://tradstry:tradstry@localhost:5435/tradstry_test";
const DATABASE_PREFIX: &str = "tradstry_test_";
const TEMPLATE_PREFIX: &str = "tradstry_template_";
const KEEP_FAILED_FOR: Duration = Duration::from_secs(24 * 60 * 60);
const TEMPLATE_LOCK: i64 = 0x7472_6164_7374_7279;
const DROP_LOCK: i64 = TEMPLATE_LOCK + 1;

pub struct TestDb {
    pool: PgPool,
    name: String,
    server: PgConnectOptions,
}

impl TestDb {
    /// A database on the current schema, with no rows.
    pub async fn new() -> Self {
        let server = server();
        let template = TEMPLATE.get_or_init(|| ensure_template(&server)).await;
        Self::create(server, Some(template)).await
    }

    /// A database with nothing in it, for tests that apply schema history themselves.
    pub async fn empty() -> Self {
        Self::create(server(), None).await
    }

    pub fn pool(&self) -> PgPool {
        self.pool.clone()
    }

    async fn create(server: PgConnectOptions, template: Option<&str>) -> Self {
        let name = format!(
            "{DATABASE_PREFIX}{}_{}",
            unix_seconds(),
            tradstry_backend::ids::new_uuid_v7().simple()
        );
        let template = template
            .map(|template| format!(" TEMPLATE \"{template}\""))
            .unwrap_or_default();
        run(
            &mut admin(&server).await,
            format!("CREATE DATABASE \"{name}\"{template}"),
            "create test database",
        )
        .await;
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect_with(server.clone().database(&name))
            .await
            .expect("connect to test database");
        Self { pool, name, server }
    }
}

impl Drop for TestDb {
    fn drop(&mut self) {
        if std::thread::panicking() {
            eprintln!("kept test database {} for inspection", self.name);
            return;
        }
        let (pool, server, name) = (self.pool.clone(), self.server.clone(), self.name.clone());
        // The pool's connections belong to the test's runtime, which must keep
        // running while the database is dropped: a connection it leaves half-open
        // stalls `DROP DATABASE` until Postgres times the login out a minute later.
        match tokio::runtime::Handle::try_current() {
            Ok(handle) if handle.runtime_flavor() == RuntimeFlavor::MultiThread => {
                tokio::task::block_in_place(|| {
                    handle.block_on(async {
                        pool.close().await;
                        drop_database(&server, &name).await;
                    })
                });
            }
            _ => std::thread::spawn(move || {
                tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("build cleanup runtime")
                    .block_on(drop_database(&server, &name));
            })
            .join()
            .expect("drop test database"),
        }
    }
}

static TEMPLATE: OnceCell<String> = OnceCell::const_new();

fn server() -> PgConnectOptions {
    let url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| DEFAULT_URL.to_string());
    PgConnectOptions::from_str(&url).expect("TEST_DATABASE_URL is a Postgres URL")
}

async fn admin(server: &PgConnectOptions) -> PgConnection {
    PgConnection::connect_with(server)
        .await
        .expect("connect to the test Postgres server (start it with `make test-db`)")
}

/// Build the template for the current schema unless it already exists. Test
/// processes run in parallel, so an advisory lock lets exactly one build it.
async fn ensure_template(server: &PgConnectOptions) -> String {
    let name = format!("{TEMPLATE_PREFIX}{}", schema_fingerprint());
    let mut admin = admin(server).await;
    advisory_lock(&mut admin, TEMPLATE_LOCK).await;

    let ready: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1 AND datistemplate)",
    )
    .bind(&name)
    .fetch_one(&mut admin)
    .await
    .expect("look up template");
    if !ready {
        build_template(server, &mut admin, &name).await;
    }
    remove_leftovers(&mut admin, &name).await;

    sqlx::query("SELECT pg_advisory_unlock($1)")
        .bind(TEMPLATE_LOCK)
        .execute(&mut admin)
        .await
        .expect("unlock template build");
    name
}

async fn build_template(server: &PgConnectOptions, admin: &mut PgConnection, name: &str) {
    // A template only counts as built once it is marked as one, so a build that
    // died halfway is simply replaced.
    run(
        admin,
        format!("DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"),
        "drop unfinished template",
    )
    .await;
    run(
        admin,
        format!("CREATE DATABASE \"{name}\""),
        "create template",
    )
    .await;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect_with(server.clone().database(name))
        .await
        .expect("connect to template");
    // The archived SQLx history first, then the SeaORM bootstrap, exactly as a
    // fresh production database is built.
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .expect("apply archived migrations to template");
    tradstry_backend::service::db::schema::bootstrap(&pool, "public")
        .await
        .expect("bootstrap template");
    pool.close().await;

    run(
        admin,
        format!("ALTER DATABASE \"{name}\" WITH IS_TEMPLATE true"),
        "mark template ready",
    )
    .await;
}

/// Drop templates for other schema versions and test databases older than a day.
async fn remove_leftovers(admin: &mut PgConnection, template: &str) {
    let names: Vec<String> = sqlx::query_scalar(
        "SELECT datname FROM pg_database WHERE datname LIKE $1 OR datname LIKE $2",
    )
    .bind(format!("{TEMPLATE_PREFIX}%"))
    .bind(format!("{DATABASE_PREFIX}%"))
    .fetch_all(&mut *admin)
    .await
    .expect("list test databases");

    let cutoff = unix_seconds().saturating_sub(KEEP_FAILED_FOR.as_secs());
    for name in names {
        let stale = match name.strip_prefix(DATABASE_PREFIX) {
            Some(rest) => rest
                .split('_')
                .next()
                .and_then(|created| created.parse::<u64>().ok())
                .is_some_and(|created| created < cutoff),
            None => name != template,
        };
        if stale {
            run(
                admin,
                format!("ALTER DATABASE \"{name}\" WITH IS_TEMPLATE false"),
                "unmark old template",
            )
            .await;
            run(
                admin,
                format!("DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"),
                "drop leftover test database",
            )
            .await;
        }
    }
}

/// `DROP DATABASE` waits until every server process accepts a signal barrier,
/// which a process blocked in another drop or a lock wait never does, so drops
/// take turns. The session lock is released when the connection closes.
async fn drop_database(server: &PgConnectOptions, name: &str) {
    let mut admin = admin(server).await;
    advisory_lock(&mut admin, DROP_LOCK).await;
    run(
        &mut admin,
        format!("DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"),
        "drop test database",
    )
    .await;
}

/// Take a session advisory lock by polling. A blocking `pg_advisory_lock` would
/// park this connection where it cannot accept another test's drop barrier.
async fn advisory_lock(conn: &mut PgConnection, key: i64) {
    loop {
        let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock($1)")
            .bind(key)
            .fetch_one(&mut *conn)
            .await
            .expect("try advisory lock");
        if locked {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

async fn run(conn: &mut PgConnection, sql: String, what: &str) {
    if let Err(error) = sqlx::raw_sql(sqlx::AssertSqlSafe(sql)).execute(conn).await {
        panic!("{what}: {error}");
    }
}

/// A hash of every file that decides what the schema looks like: the archived
/// SQLx history, the SeaORM migrations, and the database crate (entities and
/// bootstrap). Any change there builds a new template.
fn schema_fingerprint() -> String {
    let backend = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    for dir in ["schema", "migration/src", "database/src"] {
        collect_files(&backend.join(dir), &mut files);
    }
    files.sort();

    let mut hasher = Sha256::new();
    for file in files {
        hasher.update(
            file.strip_prefix(backend)
                .unwrap_or(&file)
                .to_string_lossy()
                .as_bytes(),
        );
        hasher.update(std::fs::read(&file).expect("read schema source"));
    }
    hex::encode(&hasher.finalize()[..8])
}

fn collect_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    for entry in std::fs::read_dir(dir).expect("read schema source directory") {
        let path = entry.expect("read schema source entry").path();
        if path.is_dir() {
            collect_files(&path, files);
        } else {
            files.push(path);
        }
    }
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after 1970")
        .as_secs()
}
