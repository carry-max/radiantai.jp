use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{env, fs::{self, File}, io::{self, Read}, path::{Path, PathBuf}, process::Command};

const MAX_VIDEO_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_DURATION_MS: u64 = 6 * 60 * 60 * 1000;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request {
    Probe { input: String },
    ExtractReplay { input: String, #[serde(rename = "outputDirectory")] output_directory: String, #[serde(rename = "timestampsMs")] timestamps_ms: Vec<u64> },
    ExtractAim { input: String, #[serde(rename = "outputDirectory")] output_directory: String, #[serde(rename = "eventMs")] event_ms: u64, crop: Option<String> },
    Clip { input: String, output: String, #[serde(rename = "startMs")] start_ms: u64, #[serde(rename = "endMs")] end_ms: u64 },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum Response {
    Probe { ok: bool, duration_ms: u64, width: u64, height: u64, fps: f64, sha256: String },
    Frames { ok: bool, frames: Vec<Frame> },
    Clip { ok: bool, output: String },
    Error { ok: bool, error: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Frame { path: String, timestamp_ms: u64 }

#[derive(Clone)]
struct VideoProbe { duration_ms: u64, width: u64, height: u64, fps: f64, sha256: String }

fn main() {
    let result = run();
    let response = match result { Ok(response) => response, Err(error) => Response::Error { ok: false, error: error.to_string() } };
    println!("{}", serde_json::to_string(&response).unwrap_or_else(|_| "{\"ok\":false,\"error\":\"serialization_failed\"}".into()));
    if matches!(response, Response::Error { .. }) { std::process::exit(1); }
}

fn run() -> Result<Response> {
    let mut body = String::new();
    io::stdin().take(1_048_577).read_to_string(&mut body)?;
    if body.len() > 1_048_576 { bail!("request_too_large"); }
    let request: Request = serde_json::from_str(&body).context("invalid_request")?;
    match request {
        Request::Probe { input } => {
            let probe = probe_video(&safe_input(&input)?)?;
            Ok(Response::Probe { ok: true, duration_ms: probe.duration_ms, width: probe.width, height: probe.height, fps: probe.fps, sha256: probe.sha256 })
        }
        Request::ExtractReplay { input, output_directory, timestamps_ms } => {
            let input = safe_input(&input)?; let probe = probe_video(&input)?;
            let times = validated_times(timestamps_ms, probe.duration_ms, 2, 6)?;
            Ok(Response::Frames { ok: true, frames: extract_frames(&input, &safe_output_dir(&output_directory)?, &times, false)? })
        }
        Request::ExtractAim { input, output_directory, event_ms, crop } => {
            let input = safe_input(&input)?; let probe = probe_video(&input)?;
            let times = aim_timestamps(event_ms, probe.duration_ms);
            Ok(Response::Frames { ok: true, frames: extract_frames(&input, &safe_output_dir(&output_directory)?, &times, crop.as_deref() == Some("center"))? })
        }
        Request::Clip { input, output, start_ms, end_ms } => {
            let input = safe_input(&input)?; let probe = probe_video(&input)?;
            if start_ms >= end_ms || end_ms > probe.duration_ms || end_ms - start_ms > 120_000 { bail!("invalid_clip_range"); }
            let output = safe_output_file(&output)?; clip_video(&input, &output, start_ms, end_ms)?;
            Ok(Response::Clip { ok: true, output: output.to_string_lossy().into_owned() })
        }
    }
}

fn safe_input(value: &str) -> Result<PathBuf> {
    let path = fs::canonicalize(value).context("video_not_found")?;
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_VIDEO_BYTES { bail!("invalid_video_file"); }
    Ok(path)
}

fn safe_output_dir(value: &str) -> Result<PathBuf> {
    let path = PathBuf::from(value);
    if !path.is_absolute() { bail!("output_must_be_absolute"); }
    fs::create_dir_all(&path)?;
    fs::canonicalize(path).context("invalid_output_directory")
}

fn safe_output_file(value: &str) -> Result<PathBuf> {
    let path = PathBuf::from(value);
    if !path.is_absolute() { bail!("output_must_be_absolute"); }
    let parent = path.parent().ok_or_else(|| anyhow!("invalid_output_file"))?;
    fs::create_dir_all(parent)?;
    Ok(path)
}

fn ffmpeg_binary() -> String { env::var("RADIANTAI_FFMPEG").unwrap_or_else(|_| "ffmpeg".into()) }
fn ffprobe_binary() -> String { env::var("RADIANTAI_FFPROBE").unwrap_or_else(|_| "ffprobe".into()) }

fn probe_video(input: &Path) -> Result<VideoProbe> {
    let output = Command::new(ffprobe_binary()).args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate:format=duration", "-of", "json"]).arg(input).output().context("ffprobe_unavailable")?;
    if !output.status.success() { bail!("ffprobe_failed"); }
    let data: Value = serde_json::from_slice(&output.stdout).context("invalid_ffprobe_output")?;
    let stream = data.get("streams").and_then(Value::as_array).and_then(|items| items.first()).ok_or_else(|| anyhow!("video_stream_missing"))?;
    let duration = data.pointer("/format/duration").and_then(Value::as_str).and_then(|value| value.parse::<f64>().ok()).ok_or_else(|| anyhow!("duration_missing"))?;
    let duration_ms = (duration * 1000.0).round() as u64;
    if duration_ms == 0 || duration_ms > MAX_DURATION_MS { bail!("invalid_video_duration"); }
    let width = stream.get("width").and_then(Value::as_u64).unwrap_or(0);
    let height = stream.get("height").and_then(Value::as_u64).unwrap_or(0);
    if width < 320 || height < 180 || width > 8192 || height > 8192 { bail!("invalid_video_dimensions"); }
    let fps = parse_rate(stream.get("avg_frame_rate").and_then(Value::as_str).unwrap_or("0/1"));
    let mut file = File::open(input)?; let mut hasher = Sha256::new(); let mut buffer = [0_u8; 1024 * 1024];
    loop { let count = file.read(&mut buffer)?; if count == 0 { break; } hasher.update(&buffer[..count]); }
    Ok(VideoProbe { duration_ms, width, height, fps, sha256: format!("{:x}", hasher.finalize()) })
}

fn parse_rate(value: &str) -> f64 {
    let mut parts = value.split('/');
    let numerator = parts.next().and_then(|item| item.parse::<f64>().ok()).unwrap_or(0.0);
    let denominator = parts.next().and_then(|item| item.parse::<f64>().ok()).unwrap_or(1.0);
    if denominator == 0.0 { 0.0 } else { numerator / denominator }
}

fn validated_times(mut times: Vec<u64>, duration_ms: u64, min: usize, max: usize) -> Result<Vec<u64>> {
    if times.len() < min || times.len() > max { bail!("invalid_timestamp_count"); }
    times.sort_unstable(); times.dedup();
    if times.len() < min || times.iter().any(|time| *time >= duration_ms) { bail!("invalid_timestamps"); }
    Ok(times)
}

fn aim_timestamps(event_ms: u64, duration_ms: u64) -> Vec<u64> {
    [-400_i64, -240, -80, 80, 240, 400].into_iter().map(|offset| ((event_ms as i64 + offset).clamp(0, duration_ms.saturating_sub(1) as i64)) as u64).collect()
}

fn extract_frames(input: &Path, output_dir: &Path, times: &[u64], center_crop: bool) -> Result<Vec<Frame>> {
    let mut frames = Vec::with_capacity(times.len());
    for (index, timestamp_ms) in times.iter().enumerate() {
        let output = output_dir.join(format!("frame-{:02}-{}.jpg", index + 1, timestamp_ms));
        let mut command = Command::new(ffmpeg_binary());
        command.args(["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", &format!("{:.3}", *timestamp_ms as f64 / 1000.0), "-i"]).arg(input).args(["-frames:v", "1"]);
        if center_crop { command.args(["-vf", "crop=iw*0.55:ih*0.55:(iw-ow)/2:(ih-oh)/2,scale=960:-2"]); }
        else { command.args(["-vf", "scale='min(1280,iw)':-2"]); }
        let status = command.args(["-q:v", "4", "-y"]).arg(&output).status().context("ffmpeg_unavailable")?;
        if !status.success() { bail!("ffmpeg_frame_failed"); }
        frames.push(Frame { path: output.to_string_lossy().into_owned(), timestamp_ms: *timestamp_ms });
    }
    Ok(frames)
}

fn clip_video(input: &Path, output: &Path, start_ms: u64, end_ms: u64) -> Result<()> {
    let duration = end_ms - start_ms;
    let status = Command::new(ffmpeg_binary()).args(["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", &format!("{:.3}", start_ms as f64 / 1000.0), "-i"]).arg(input).args(["-t", &format!("{:.3}", duration as f64 / 1000.0), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y"]).arg(output).status().context("ffmpeg_unavailable")?;
    if !status.success() { bail!("ffmpeg_clip_failed"); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aim_sequence_has_six_ordered_points() {
        assert_eq!(aim_timestamps(1_000, 3_000), vec![600, 760, 920, 1080, 1240, 1400]);
    }
    #[test]
    fn timestamps_reject_duplicates() {
        assert!(validated_times(vec![100, 100], 1_000, 2, 6).is_err());
    }
    #[test]
    fn rate_parser_handles_fraction() { assert_eq!(parse_rate("60000/1000"), 60.0); }
}
