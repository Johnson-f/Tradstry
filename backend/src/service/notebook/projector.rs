use anyhow::{Context, Result, anyhow};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex;

// Asymmetric stdio contract: `project` takes base64 update blobs (one per line) and
// emits document JSON; `seed` takes raw document JSON and emits a single base64 blob.
const PROJECT_ENTRY: &str = "project.mjs";
const SEED_ENTRY: &str = "seed.mjs";
const COMPACT_ENTRY: &str = "compact.mjs";
const MARKDOWN_ENTRY: &str = "markdown.mjs";
const EXCHANGE_ENTRY: &str = "exchange.mjs";
const GENERATED_BUNDLES: [&str; 2] = ["notebook-core.gen.mjs", "notebook-seed.gen.mjs"];
static PREPARE_LOCK: Mutex<()> = Mutex::const_new(());

/// Where `projector/` lives. In the Docker image it sits next to the binary; under
/// `cargo test` the binary is in target/debug, so fall back to the crate root.
fn projector_dir() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("PROJECTOR_DIR") {
        return std::path::PathBuf::from(dir);
    }
    if let Ok(exe) = std::env::current_exe()
        && let Some(beside_binary) = exe.parent().map(|p| p.join("projector"))
        && beside_binary.is_dir()
    {
        return beside_binary;
    }
    std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/projector"))
}

/// Verify the untracked projector bundles exist, generating them from the shared
/// notebook package when running from a source checkout. Docker builds create
/// these ahead of time; this fallback keeps direct `cargo run` and tests equally
/// reliable after a clean checkout or `make cleanup`.
pub async fn ensure_ready() -> Result<()> {
    let dir = projector_dir();
    if GENERATED_BUNDLES
        .iter()
        .all(|name| dir.join(name).is_file())
    {
        return Ok(());
    }

    let _guard = PREPARE_LOCK.lock().await;
    if GENERATED_BUNDLES
        .iter()
        .all(|name| dir.join(name).is_file())
    {
        return Ok(());
    }

    let package = dir.join("package.json");
    if !package.is_file() {
        return Err(anyhow!(
            "projector generated bundles are missing and {} is unavailable",
            package.display()
        ));
    }

    let output = Command::new("bun")
        .args(["run", "sync-core"])
        .current_dir(&dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .context("failed to run projector sync-core")?;
    if !output.status.success() {
        return Err(anyhow!(
            "projector sync-core failed (status {}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let missing: Vec<&str> = GENERATED_BUNDLES
        .iter()
        .copied()
        .filter(|name| !dir.join(name).is_file())
        .collect();
    if !missing.is_empty() {
        return Err(anyhow!(
            "projector sync-core completed without producing {}",
            missing.join(", ")
        ));
    }
    Ok(())
}

async fn run(script: &str, stdin: Vec<u8>) -> Result<Vec<u8>> {
    ensure_ready().await?;
    let entry = projector_dir().join(script);
    let entry = entry.display().to_string();
    let entry = entry.as_str();
    // Lexical's dev bundles have a circular init that throws under Bun ("Cannot access
    // 'defineImportRule' before initialization"), which fails every seed and freezes the
    // note in `seeding` forever. Bun does not infer conditions from NODE_ENV, so the
    // production exports must be selected explicitly.
    let mut child = Command::new("bun")
        .arg("--conditions=production")
        .arg(entry)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to spawn bun for {entry}"))?;

    child
        .stdin
        .take()
        .context("child stdin was not piped")?
        .write_all(&stdin)
        .await
        .context("failed to write to bun stdin")?;

    let output = child
        .wait_with_output()
        .await
        .context("failed to wait on bun")?;

    // Never yield an empty document on failure: a blank projection would silently wipe
    // the note's derived title and its vector-search embeddings.
    if !output.status.success() || output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!(
            "projector {entry} failed (status {}): {}",
            output.status,
            stderr.trim()
        ));
    }

    Ok(output.stdout)
}

pub async fn project(updates: &[Vec<u8>]) -> Result<String> {
    // Projecting zero updates is a bug, not an empty document; fail before spawning.
    if updates.is_empty() {
        return Err(anyhow!("project: refusing to project zero updates"));
    }

    let mut stdin = Vec::new();
    for update in updates {
        stdin.extend_from_slice(BASE64.encode(update).as_bytes());
        stdin.push(b'\n');
    }

    let stdout = run(PROJECT_ENTRY, stdin).await?;
    String::from_utf8(stdout).context("projector emitted non-UTF-8 document JSON")
}

pub struct Seeded {
    pub update: Vec<u8>,
    /// A real Yjs state vector for the seeded doc; delta-pull work depends on it.
    pub state_vector: Vec<u8>,
}

pub async fn seed(document_json: &str) -> Result<Seeded> {
    #[derive(serde::Deserialize)]
    struct Raw {
        update: String,
        #[serde(rename = "stateVector")]
        state_vector: String,
    }

    let stdout = run(SEED_ENTRY, document_json.as_bytes().to_vec()).await?;
    let raw: Raw = serde_json::from_slice(&stdout).context("seeder emitted invalid JSON")?;
    Ok(Seeded {
        update: BASE64
            .decode(raw.update.trim())
            .context("seeder emitted invalid base64 update")?,
        state_vector: BASE64
            .decode(raw.state_vector.trim())
            .context("seeder emitted invalid base64 state vector")?,
    })
}

/// Collapses a note's update chain into one equivalent blob.
pub async fn compact(updates: &[Vec<u8>]) -> Result<Vec<u8>> {
    // An empty merge yields a blob that projects as an empty document, which would
    // replace the note's whole history with nothing.
    if updates.is_empty() {
        return Err(anyhow!("compact: refusing to compact zero updates"));
    }

    let mut stdin = Vec::new();
    for update in updates {
        stdin.extend_from_slice(BASE64.encode(update).as_bytes());
        stdin.push(b'\n');
    }

    let stdout = run(COMPACT_ENTRY, stdin).await?;
    let encoded = String::from_utf8(stdout).context("compactor emitted non-UTF-8 output")?;
    BASE64
        .decode(encoded.trim())
        .context("compactor emitted invalid base64 update")
}

/// Markdown -> Lexical `document_json`, for a note that does not exist yet.
///
/// The conversion lives in the projector rather than Rust so there is exactly one
/// implementation of "what Tradstry understands" — the same bundle that seeds and projects.
pub async fn markdown_to_json(markdown: &str) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct Raw {
        #[serde(rename = "documentJson")]
        document_json: String,
    }

    let stdin = serde_json::json!({ "op": "toJson", "markdown": markdown });
    let stdout = run(MARKDOWN_ENTRY, serde_json::to_vec(&stdin)?).await?;
    let raw: Raw = serde_json::from_slice(&stdout).context("markdown emitted invalid JSON")?;
    Ok(raw.document_json)
}

/// What Tradstry Markdown may reference beyond what the note already holds, and
/// how trades are labelled when exported.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ExchangeContext {
    pub trades: std::collections::HashMap<String, String>,
    pub media: std::collections::HashMap<String, ExchangeMedia>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ExchangeMedia {
    #[serde(rename = "type")]
    pub kind: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

/// A refusal the caller can act on, such as a stale revision or an unknown
/// reference. `message` starts with `code`.
#[derive(Debug, Clone, thiserror::Error, serde::Deserialize)]
#[error("{message}")]
pub struct ExchangeRejection {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
pub struct ExchangeReferences {
    pub media: Vec<String>,
    pub trades: Vec<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ExportedNote {
    pub markdown: String,
    pub placeholders: i32,
    pub revision: String,
    pub references: ExchangeReferences,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocument {
    pub document_json: String,
    pub references: ExchangeReferences,
}

/// A whole-note edit. Every kind becomes "the note's new Markdown", applied by
/// changing only the blocks that differ.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NoteEdit {
    ReplaceText { edits: Vec<TextEdit> },
    Append { markdown: String },
    Rewrite { markdown: String },
    SetTitle { title: String },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TextEdit {
    pub old: String,
    pub new: String,
}

#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
pub struct EditChanges {
    pub kept: i32,
    pub changed: i32,
    pub inserted: i32,
    pub removed: i32,
}

#[derive(Debug, Clone)]
pub struct EditedNote {
    /// The incremental Yjs update to append; None when the edit changed nothing.
    pub update: Option<Vec<u8>>,
    pub revision: String,
    pub markdown: String,
    pub placeholders: i32,
    pub document_json: String,
    pub changes: EditChanges,
    pub formatting_lost: Vec<String>,
    pub references: ExchangeReferences,
}

async fn exchange<T: serde::de::DeserializeOwned>(input: serde_json::Value) -> Result<T> {
    #[derive(serde::Deserialize)]
    struct Rejected {
        error: Option<ExchangeRejection>,
    }

    let stdout = run(EXCHANGE_ENTRY, serde_json::to_vec(&input)?).await?;
    if let Ok(Rejected {
        error: Some(rejection),
    }) = serde_json::from_slice::<Rejected>(&stdout)
    {
        return Err(rejection.into());
    }
    serde_json::from_slice(&stdout).context("exchange emitted invalid JSON")
}

fn encode_updates(updates: &[Vec<u8>]) -> Vec<String> {
    updates.iter().map(|u| BASE64.encode(u)).collect()
}

/// The note as Tradstry Markdown, with its revision.
pub async fn export_note(updates: &[Vec<u8>], context: &ExchangeContext) -> Result<ExportedNote> {
    if updates.is_empty() {
        return Err(anyhow!("export_note: note has no updates"));
    }
    exchange(serde_json::json!({
        "op": "export",
        "updates": encode_updates(updates),
        "context": context,
    }))
    .await
}

/// A new note's `document_json` from Tradstry Markdown.
pub async fn markdown_document(
    markdown: &str,
    context: &ExchangeContext,
) -> Result<MarkdownDocument> {
    exchange(serde_json::json!({ "op": "create", "markdown": markdown, "context": context })).await
}

/// Applies `edit` to a CRDT note, refusing when its revision is not `expected_revision`.
pub async fn edit_note(
    updates: &[Vec<u8>],
    edit: &NoteEdit,
    expected_revision: Option<&str>,
    context: &ExchangeContext,
) -> Result<EditedNote> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Raw {
        update: Option<String>,
        revision: String,
        markdown: String,
        placeholders: i32,
        document_json: String,
        changes: EditChanges,
        formatting_lost: Vec<String>,
        references: ExchangeReferences,
    }

    if updates.is_empty() {
        return Err(anyhow!("edit_note: note has no updates"));
    }
    let raw: Raw = exchange(serde_json::json!({
        "op": "edit",
        "updates": encode_updates(updates),
        "edit": edit,
        "expectedRevision": expected_revision,
        "context": context,
    }))
    .await?;
    Ok(EditedNote {
        update: raw
            .update
            .map(|u| BASE64.decode(u.trim()))
            .transpose()
            .context("exchange emitted an invalid base64 update")?,
        revision: raw.revision,
        markdown: raw.markdown,
        placeholders: raw.placeholders,
        document_json: raw.document_json,
        changes: raw.changes,
        formatting_lost: raw.formatting_lost,
        references: raw.references,
    })
}
