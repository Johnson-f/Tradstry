use anyhow::{Result, ensure};
use serde::Deserialize;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::Semaphore;

const PROCESS_TIMEOUT: Duration = Duration::from_secs(120);

fn process_semaphore() -> Arc<Semaphore> {
    static SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();
    SEMAPHORE
        .get_or_init(|| Arc::new(Semaphore::new(2)))
        .clone()
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    #[serde(default)]
    streams: Vec<FfStream>,
    #[serde(default)]
    format: FfFormat,
}

#[derive(Debug, Deserialize)]
struct FfStream {
    width: Option<i64>,
    height: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
struct FfFormat {
    duration: Option<String>,
}

/// Probed video metadata.
#[derive(Debug, Clone, Copy)]
pub struct VideoMetadata {
    pub width: i64,
    pub height: i64,
    pub duration_seconds: f64,
}

/// Best-effort video probe via `ffprobe` (requires ffmpeg installed).
///
/// Returns zeroed metadata if ffprobe is unavailable or fails, so an upload is
/// never blocked by a missing/odd codec — we just store what we could read.
pub async fn probe_video(bytes: &[u8]) -> VideoMetadata {
    match probe_video_inner(bytes).await {
        Ok(meta) => meta,
        Err(error) => {
            log::warn!("ffprobe video probe failed: {error}");
            VideoMetadata {
                width: 0,
                height: 0,
                duration_seconds: 0.0,
            }
        }
    }
}

pub async fn probe_video_file(path: &std::path::Path) -> Result<VideoMetadata> {
    let _permit = process_semaphore().acquire_owned().await?;
    let output = run_ffprobe(path).await?;
    let width = output
        .streams
        .iter()
        .find_map(|stream| stream.width)
        .unwrap_or(0);
    let height = output
        .streams
        .iter()
        .find_map(|stream| stream.height)
        .unwrap_or(0);
    let duration_seconds = output
        .format
        .duration
        .as_deref()
        .and_then(|duration| duration.parse::<f64>().ok())
        .unwrap_or(0.0);
    ensure!(
        width > 0 && height > 0,
        "video has no decodable video stream"
    );
    Ok(VideoMetadata {
        width,
        height,
        duration_seconds,
    })
}

async fn probe_video_inner(bytes: &[u8]) -> Result<VideoMetadata> {
    // ffprobe needs a seekable input for reliable duration, so write a temp file.
    let tmp = std::env::temp_dir().join(format!("tradstry-probe-{}", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp, bytes).await?;

    let result = probe_video_file(&tmp).await;
    let _ = tokio::fs::remove_file(&tmp).await;
    result
}

/// Extract up to `max_frames` evenly-spaced JPEG keyframes from a video
/// (best-effort). Returns raw JPEG bytes per frame; empty vec on failure or if
/// ffmpeg is unavailable.
pub async fn extract_keyframes(bytes: &[u8], max_frames: usize) -> Vec<Vec<u8>> {
    if max_frames == 0 {
        return vec![];
    }
    match extract_keyframes_inner(bytes, max_frames).await {
        Ok(frames) => frames,
        Err(error) => {
            log::warn!("ffmpeg keyframe extraction failed: {error}");
            vec![]
        }
    }
}

async fn extract_keyframes_inner(bytes: &[u8], max_frames: usize) -> Result<Vec<Vec<u8>>> {
    // Write the video bytes to a temp input file (mirrors probe_video).
    let tmp_input = std::env::temp_dir().join(format!("tradstry-kf-in-{}", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp_input, bytes).await?;

    // Create a dedicated temp directory for the output JPEG frames.
    let tmp_out_dir =
        std::env::temp_dir().join(format!("tradstry-kf-out-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir(&tmp_out_dir).await?;

    let ffmpeg_result = extract_keyframes_file(&tmp_input, &tmp_out_dir, max_frames).await;

    // Clean up the input temp file regardless of outcome (mirrors probe_video).
    let _ = tokio::fs::remove_file(&tmp_input).await;

    let frames_result: Result<Vec<Vec<u8>>> = async {
        ffmpeg_result?;
        let mut entries = tokio::fs::read_dir(&tmp_out_dir).await?;
        let mut jpg_paths: Vec<std::path::PathBuf> = Vec::new();
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("jpg") {
                jpg_paths.push(path);
            }
        }
        jpg_paths.sort();
        jpg_paths.truncate(max_frames);

        let mut frames: Vec<Vec<u8>> = Vec::with_capacity(jpg_paths.len());
        for p in &jpg_paths {
            match tokio::fs::read(p).await {
                Ok(data) => frames.push(data),
                Err(e) => {
                    log::warn!("ffmpeg keyframe: could not read frame {}: {e}", p.display())
                }
            }
        }
        Ok(frames)
    }
    .await;

    // Clean up the output temp directory unconditionally (success or error).
    let _ = tokio::fs::remove_dir_all(&tmp_out_dir).await;

    frames_result
}

pub async fn extract_keyframes_from_file(
    input: &std::path::Path,
    max_frames: usize,
) -> Result<Vec<Vec<u8>>> {
    if max_frames == 0 {
        return Ok(Vec::new());
    }
    let output = tempfile::tempdir()?;
    extract_keyframes_file(input, output.path(), max_frames).await?;
    let mut entries = tokio::fs::read_dir(output.path()).await?;
    let mut paths = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) == Some("jpg") {
            paths.push(path);
        }
    }
    paths.sort();
    paths.truncate(max_frames);
    let mut frames = Vec::with_capacity(paths.len());
    for path in paths {
        frames.push(tokio::fs::read(path).await?);
    }
    Ok(frames)
}

async fn extract_keyframes_file(
    input: &std::path::Path,
    output: &std::path::Path,
    max_frames: usize,
) -> Result<()> {
    let _permit = process_semaphore().acquire_owned().await?;
    run_ffmpeg_keyframes(input, output, max_frames).await
}

async fn run_ffmpeg_keyframes(
    input: &std::path::Path,
    out_dir: &std::path::Path,
    max_frames: usize,
) -> Result<()> {
    let out_pattern = out_dir.join("frame_%03d.jpg");
    let mut command = tokio::process::Command::new("ffmpeg");
    command
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null())
        .args(["-nostdin", "-v", "error", "-y", "-i"])
        .arg(input)
        .args(["-vf", "thumbnail,fps=1"])
        .args(["-frames:v", &max_frames.to_string()])
        .args(["-f", "image2"])
        .arg(&out_pattern);
    let output = tokio::time::timeout(PROCESS_TIMEOUT, command.output())
        .await
        .map_err(|_| anyhow::anyhow!("ffmpeg timed out"))??;

    ensure!(
        output.status.success(),
        "ffmpeg exited with status {}",
        output.status
    );

    Ok(())
}

async fn run_ffprobe(path: &std::path::Path) -> Result<FfprobeOutput> {
    let mut command = tokio::process::Command::new("ffprobe");
    command
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null())
        .args([
            "-nostdin",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
        ])
        .arg(path);
    let output = tokio::time::timeout(PROCESS_TIMEOUT, command.output())
        .await
        .map_err(|_| anyhow::anyhow!("ffprobe timed out"))??;

    ensure!(
        output.status.success(),
        "ffprobe exited with status {}",
        output.status
    );

    let parsed: FfprobeOutput = serde_json::from_slice(&output.stdout)?;
    Ok(parsed)
}
