//! One-time import of Clerk users into Stytch, and the backfill that links the
//! resulting Stytch IDs to existing `users` rows.
//!
//!   stytch_import --csv clerk_export.csv --out mapping.csv [--dry-run]
//!   stytch_import --backfill --out mapping.csv [--dry-run]
//!
//! The import needs `STYTCH_PROJECT_ID` and `STYTCH_SECRET`; the backfill needs
//! `POSTGRES_URL` (and `POSTGRES_DATABASE`, as the backend does). The Clerk
//! export holds password hashes: keep it out of the repo.

use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use tokio::time::Instant;
use tradstry_backend::service::stytch::{
    CreateUser, MigratePassword, PersonName, StytchClient, StytchError,
};

const MIN_REQUEST_SPACING: Duration = Duration::from_millis(20);
const MAX_ATTEMPTS: u32 = 6;
const MAPPING_HEADER: [&str; 2] = ["clerk_id", "stytch_user_id"];

#[derive(Debug, Default, PartialEq, Eq)]
struct Args {
    csv: Option<PathBuf>,
    out: Option<PathBuf>,
    backfill: bool,
    dry_run: bool,
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Args> {
    let mut parsed = Args::default();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--csv" => parsed.csv = Some(args.next().context("--csv needs a path")?.into()),
            "--out" => parsed.out = Some(args.next().context("--out needs a path")?.into()),
            "--backfill" => parsed.backfill = true,
            "--dry-run" => parsed.dry_run = true,
            other => bail!("unknown argument {other}"),
        }
    }
    if parsed.out.is_none() {
        bail!("--out <mapping.csv> is required");
    }
    if !parsed.backfill && parsed.csv.is_none() {
        bail!("--csv <clerk export> is required unless --backfill is set");
    }
    Ok(parsed)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ClerkUser {
    id: String,
    primary_email: String,
    verified_emails: Vec<String>,
    first_name: String,
    last_name: String,
    password_digest: String,
    password_hasher: String,
}

impl ClerkUser {
    fn has_password(&self) -> bool {
        !self.password_digest.is_empty()
    }

    fn email_is_verified(&self) -> bool {
        self.verified_emails
            .iter()
            .any(|email| email.eq_ignore_ascii_case(&self.primary_email))
    }

    fn name(&self) -> PersonName {
        PersonName {
            first_name: self.first_name.clone(),
            last_name: self.last_name.clone(),
        }
    }
}

/// Clerk exports list fields as `a,b`, `a|b`, or a JSON array, depending on the
/// export; accept all three.
fn parse_list(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.starts_with('[')
        && let Ok(items) = serde_json::from_str::<Vec<String>>(raw)
    {
        return items
            .into_iter()
            .map(|item| item.trim().to_owned())
            .filter(|item| !item.is_empty())
            .collect();
    }
    raw.split([',', '|', ';'])
        .map(|item| item.trim().trim_matches('"').trim().to_owned())
        .filter(|item| !item.is_empty())
        .collect()
}

fn read_clerk_users(reader: impl std::io::Read) -> Result<Vec<ClerkUser>> {
    let mut reader = csv::ReaderBuilder::new().flexible(true).from_reader(reader);
    let headers = reader.headers().context("read the CSV header")?.clone();
    let column = |name: &str| headers.iter().position(|header| header.trim() == name);
    let id_column = column("id").context("the CSV has no id column")?;
    let email_column =
        column("primary_email_address").context("the CSV has no primary_email_address column")?;
    let (verified, first, last, digest, hasher) = (
        column("verified_email_addresses"),
        column("first_name"),
        column("last_name"),
        column("password_digest"),
        column("password_hasher"),
    );

    let mut users = Vec::new();
    for record in reader.records() {
        let record = record.context("read a CSV row")?;
        let field = |index: Option<usize>| {
            index
                .and_then(|index| record.get(index))
                .unwrap_or("")
                .trim()
                .to_owned()
        };
        let id = field(Some(id_column));
        if id.is_empty() {
            continue;
        }
        users.push(ClerkUser {
            id,
            primary_email: field(Some(email_column)),
            verified_emails: parse_list(&field(verified)),
            first_name: field(first),
            last_name: field(last),
            password_digest: field(digest),
            password_hasher: field(hasher),
        });
    }
    Ok(users)
}

fn validate(users: &[ClerkUser]) -> Vec<String> {
    let mut problems = Vec::new();
    for user in users {
        if user.primary_email.is_empty() {
            problems.push(format!("{}: no primary email", user.id));
        }
        if user.has_password() && !user.password_hasher.eq_ignore_ascii_case("bcrypt") {
            problems.push(format!(
                "{}: password hasher {:?} is not bcrypt",
                user.id, user.password_hasher
            ));
        }
    }
    problems
}

fn read_mapping(path: &Path) -> Result<Vec<(String, String)>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut reader = csv::Reader::from_path(path)
        .with_context(|| format!("open the mapping file {}", path.display()))?;
    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record?;
        if let (Some(clerk_id), Some(stytch_user_id)) = (record.get(0), record.get(1)) {
            rows.push((clerk_id.to_owned(), stytch_user_id.to_owned()));
        }
    }
    Ok(rows)
}

struct MappingWriter {
    file: std::fs::File,
}

impl MappingWriter {
    fn open(path: &Path) -> Result<Self> {
        let is_new = std::fs::metadata(path).map_or(true, |meta| meta.len() == 0);
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .with_context(|| format!("open the mapping file {}", path.display()))?;
        if is_new {
            writeln!(file, "{},{}", MAPPING_HEADER[0], MAPPING_HEADER[1])?;
        }
        Ok(Self { file })
    }

    fn record(&mut self, clerk_id: &str, stytch_user_id: &str) -> Result<()> {
        writeln!(self.file, "{clerk_id},{stytch_user_id}")?;
        self.file.flush()?;
        Ok(())
    }
}

struct Throttle {
    last: Option<Instant>,
}

impl Throttle {
    async fn wait(&mut self) {
        if let Some(last) = self.last {
            tokio::time::sleep_until(last + MIN_REQUEST_SPACING).await;
        }
        self.last = Some(Instant::now());
    }
}

async fn with_retries<T, F, Fut>(throttle: &mut Throttle, mut call: F) -> Result<T, StytchError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, StytchError>>,
{
    let mut delay = Duration::from_millis(500);
    for attempt in 1..=MAX_ATTEMPTS {
        throttle.wait().await;
        match call().await {
            Err(error) if error.is_retryable() && attempt < MAX_ATTEMPTS => {
                eprintln!("  retrying in {delay:?}: {error}");
                tokio::time::sleep(delay).await;
                delay *= 2;
            }
            result => return result,
        }
    }
    unreachable!("the last attempt always returns")
}

async fn import_user(
    client: &StytchClient,
    throttle: &mut Throttle,
    user: &ClerkUser,
) -> Result<String, StytchError> {
    let trusted_metadata = json!({ "clerk_id": user.id });
    let created = if user.has_password() {
        let request = MigratePassword {
            email: user.primary_email.clone(),
            hash: user.password_digest.clone(),
            hash_type: "bcrypt".to_owned(),
            external_id: user.id.clone(),
            name: user.name(),
            set_email_verified: user.email_is_verified(),
            trusted_metadata,
        };
        with_retries(throttle, || client.migrate_password(&request))
            .await
            .map(|response| response.user_id)
    } else {
        let request = CreateUser {
            email: user.primary_email.clone(),
            external_id: user.id.clone(),
            name: user.name(),
            trusted_metadata,
        };
        with_retries(throttle, || client.create_user(&request))
            .await
            .map(|response| response.user_id)
    };

    match created {
        Err(error) if !error.is_retryable() => {
            eprintln!("  {}: {error}; looking the user up by external id", user.id);
            if let Ok(existing) = with_retries(throttle, || client.get_user(&user.id)).await {
                return Ok(existing.user_id);
            }
            if error.error_type() != Some("duplicate_email") {
                return Err(error);
            }
            adopt_existing_user(client, throttle, user)
                .await
                .map_err(|reason| StytchError::Api {
                    status: 409,
                    error_type: "cannot_link_existing_user".to_owned(),
                    message: reason,
                })
        }
        other => other,
    }
}

/// A Stytch user who signed up before the import already owns the email. Link it
/// to the Clerk account only when Stytch has verified that email, so someone who
/// registered another person's address can't inherit their data.
async fn adopt_existing_user(
    client: &StytchClient,
    throttle: &mut Throttle,
    user: &ClerkUser,
) -> Result<String, String> {
    let existing = with_retries(throttle, || client.find_user_by_email(&user.primary_email))
        .await
        .map_err(|error| error.to_string())?
        .ok_or("no Stytch user has this email")?;
    match existing.external_id.as_deref().filter(|id| !id.is_empty()) {
        Some(id) if id == user.id => return Ok(existing.user_id),
        Some(other) => {
            return Err(format!(
                "the existing Stytch user {} is linked to Clerk user {other}",
                existing.user_id
            ));
        }
        None => {}
    }
    if !existing.has_verified_email(&user.primary_email) {
        return Err(
            "the existing Stytch user hasn't verified this email; have them sign in once, then rerun"
                .to_owned(),
        );
    }
    with_retries(throttle, || {
        client.set_external_id(&existing.user_id, &user.id)
    })
    .await
    .map_err(|error| error.to_string())?;
    eprintln!("  {}: linked to the existing Stytch user", user.id);
    Ok(existing.user_id)
}

async fn run_import(args: &Args) -> Result<()> {
    let csv_path = args.csv.as_ref().context("--csv is required")?;
    let out_path = args.out.as_ref().context("--out is required")?;
    let file = std::fs::File::open(csv_path)
        .with_context(|| format!("open the Clerk export {}", csv_path.display()))?;
    let users = read_clerk_users(file)?;

    let problems = validate(&users);
    if !problems.is_empty() {
        for problem in &problems {
            eprintln!("{problem}");
        }
        bail!(
            "{} users cannot be imported; fix the export first",
            problems.len()
        );
    }

    let done: HashSet<String> = read_mapping(out_path)?
        .into_iter()
        .map(|(clerk_id, _)| clerk_id)
        .collect();
    let pending: Vec<&ClerkUser> = users
        .iter()
        .filter(|user| !done.contains(&user.id))
        .collect();
    let with_password = pending.iter().filter(|user| user.has_password()).count();
    println!(
        "{} users in the export, {} already imported, {} to import ({} with a password, {} without)",
        users.len(),
        users.len() - pending.len(),
        pending.len(),
        with_password,
        pending.len() - with_password,
    );
    if args.dry_run {
        return Ok(());
    }

    let client = StytchClient::from_env()?
        .context("STYTCH_PROJECT_ID and STYTCH_SECRET must be set to import")?;
    let mut writer = MappingWriter::open(out_path)?;
    let mut throttle = Throttle { last: None };
    let mut failures = Vec::new();
    for (index, user) in pending.iter().enumerate() {
        match import_user(&client, &mut throttle, user).await {
            Ok(stytch_user_id) => writer.record(&user.id, &stytch_user_id)?,
            Err(error) => {
                eprintln!("{}: failed: {error}", user.id);
                failures.push(user.id.clone());
            }
        }
        if (index + 1) % 100 == 0 {
            println!("{} / {}", index + 1, pending.len());
        }
    }

    println!(
        "imported {}, failed {}",
        pending.len() - failures.len(),
        failures.len()
    );
    if !failures.is_empty() {
        bail!("failed ids (rerun to retry): {}", failures.join(", "));
    }
    Ok(())
}

async fn run_backfill(args: &Args) -> Result<()> {
    let out_path = args.out.as_ref().context("--out is required")?;
    let mapping = read_mapping(out_path)?;
    if mapping.is_empty() {
        bail!("{} has no rows to backfill", out_path.display());
    }

    let url = std::env::var("POSTGRES_URL").context("POSTGRES_URL not set")?;
    let url = tradstry_database::config::url_with_search_path(&url)?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await?;

    let known: HashMap<String, Option<String>> =
        sqlx::query_as("SELECT clerk_uuid, stytch_user_id FROM users WHERE clerk_uuid IS NOT NULL")
            .fetch_all(&pool)
            .await?
            .into_iter()
            .collect();

    let (mut linked, mut already_linked) = (0, 0);
    let mut missing_rows = Vec::new();
    for (clerk_id, stytch_user_id) in &mapping {
        match known.get(clerk_id) {
            None => missing_rows.push(clerk_id.clone()),
            Some(Some(_)) => already_linked += 1,
            Some(None) if args.dry_run => linked += 1,
            Some(None) => {
                let updated = sqlx::query(
                    "UPDATE users SET stytch_user_id=$2 WHERE clerk_uuid=$1 AND stytch_user_id IS NULL",
                )
                .bind(clerk_id)
                .bind(stytch_user_id)
                .execute(&pool)
                .await?
                .rows_affected();
                linked += updated;
            }
        }
    }

    let mapped: HashSet<&String> = mapping.iter().map(|(clerk_id, _)| clerk_id).collect();
    let unmapped: Vec<&String> = known.keys().filter(|id| !mapped.contains(id)).collect();

    let verb = if args.dry_run { "would link" } else { "linked" };
    println!("{verb} {linked}, already linked {already_linked}");
    println!("clerk ids with no users row: {}", missing_rows.len());
    for id in &missing_rows {
        println!("  {id}");
    }
    println!("users rows with no mapping: {}", unmapped.len());
    for id in unmapped {
        println!("  {id}");
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let args = parse_args(std::env::args().skip(1))?;
    if args.backfill {
        run_backfill(&args).await
    } else {
        run_import(&args).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    #[test]
    fn parses_lists_in_every_export_form() {
        let expected = strings(&["a@x.com", "b@x.com"]);
        assert_eq!(parse_list("a@x.com,b@x.com"), expected);
        assert_eq!(parse_list("a@x.com | b@x.com"), expected);
        assert_eq!(parse_list(r#"["a@x.com", "b@x.com"]"#), expected);
        assert_eq!(parse_list("a@x.com;b@x.com"), expected);
        assert!(parse_list("").is_empty());
    }

    #[test]
    fn reads_the_clerk_export() {
        let csv = "id,first_name,last_name,primary_email_address,verified_email_addresses,unverified_email_addresses,password_digest,password_hasher,extra\n\
                   user_1,Ada,Lovelace,ada@x.com,\"ada@x.com,other@x.com\",,$2a$10$abc,bcrypt,z\n\
                   user_2,,,bob@x.com,,bob@x.com,,,\n";
        let users = read_clerk_users(csv.as_bytes()).unwrap();
        assert_eq!(users.len(), 2);
        assert_eq!(users[0].id, "user_1");
        assert!(users[0].has_password());
        assert!(users[0].email_is_verified());
        assert!(!users[1].has_password());
        assert!(!users[1].email_is_verified());
        assert!(validate(&users).is_empty());
    }

    #[test]
    fn rejects_other_hashers_and_missing_emails() {
        let csv = "id,primary_email_address,password_digest,password_hasher\n\
                   user_1,a@x.com,hash,argon2i\n\
                   user_2,,,\n";
        let problems = validate(&read_clerk_users(csv.as_bytes()).unwrap());
        assert_eq!(problems.len(), 2);
        assert!(problems[0].starts_with("user_1"));
        assert!(problems[1].starts_with("user_2"));
    }

    #[test]
    fn mapping_files_are_resumable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mapping.csv");
        assert!(read_mapping(&path).unwrap().is_empty());

        MappingWriter::open(&path)
            .unwrap()
            .record("user_1", "user-test-1")
            .unwrap();
        MappingWriter::open(&path)
            .unwrap()
            .record("user_2", "user-test-2")
            .unwrap();
        assert_eq!(
            read_mapping(&path).unwrap(),
            vec![
                ("user_1".to_owned(), "user-test-1".to_owned()),
                ("user_2".to_owned(), "user-test-2".to_owned()),
            ]
        );
    }

    #[test]
    fn requires_the_arguments_each_mode_needs() {
        let parse = |args: &[&str]| parse_args(args.iter().map(|arg| arg.to_string()));
        assert!(parse(&["--csv", "a.csv"]).is_err());
        assert!(parse(&["--out", "m.csv"]).is_err());
        assert!(parse(&["--csv", "a.csv", "--out", "m.csv", "--dry-run"]).is_ok());
        assert!(parse(&["--backfill", "--out", "m.csv"]).is_ok());
        assert!(parse(&["--wat", "--out", "m.csv"]).is_err());
    }
}
