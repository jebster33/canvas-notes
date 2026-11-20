//! Self-updater backed by GitHub Releases.
//!
//! Each release carries a portable `CanvasNotes-portable.exe`. Installing an
//! update downloads it (HTTPS, checksum-verified against the SHA-256 digest
//! GitHub publishes for the asset), renames the running exe aside (Windows
//! allows renaming a running file), writes the new exe in its place, and
//! relaunches once this process has exited.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
use std::time::Duration;

pub const REPO: &str = "jebster33/canvas-notes";
const ASSET_SUFFIX: &str = "-portable.exe";
const MAX_BYTES: u64 = 300 * 1024 * 1024;

#[derive(Serialize, Default)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub newer: bool,
    pub notes: String,
    pub page: String,
    pub asset_url: Option<String>,
    pub asset_sha256: Option<String>,
    pub asset_size: u64,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digest: Option<String>,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(60))
        .redirects(5)
        .user_agent(concat!("CanvasNotes-Updater/", env!("CARGO_PKG_VERSION")))
        .build()
}

/// "v1.2.10" → [1, 2, 10]; anything non-numeric counts as 0.
fn parse_version(v: &str) -> Vec<u64> {
    v.trim().trim_start_matches(['v', 'V']).split(['.', '-', '+']).take(3).map(|p| p.parse().unwrap_or(0)).collect()
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    let (mut a, mut b) = (parse_version(latest), parse_version(current));
    a.resize(3, 0);
    b.resize(3, 0);
    a > b
}

pub fn check() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let resp = match agent().get(&url).set("Accept", "application/vnd.github+json").call() {
        Ok(r) => r,
        // No releases published yet.
        Err(ureq::Error::Status(404, _)) => return Ok(UpdateInfo { latest: current.clone(), current, ..Default::default() }),
        Err(ureq::Error::Status(403, _)) => return Err("GitHub is rate-limiting update checks right now. Try again in a little while.".into()),
        Err(e) => return Err(format!("couldn't reach GitHub: {e}")),
    };
    let rel: Release = resp.into_json().map_err(|e| format!("unexpected answer from GitHub: {e}"))?;
    if rel.draft || rel.prerelease {
        return Ok(UpdateInfo { latest: current.clone(), current, ..Default::default() });
    }
    let asset = rel.assets.iter().find(|a| a.name.to_ascii_lowercase().ends_with(ASSET_SUFFIX));
    Ok(UpdateInfo {
        newer: is_newer(&rel.tag_name, &current),
        latest: rel.tag_name.trim_start_matches(['v', 'V']).to_string(),
        current,
        notes: rel.body.unwrap_or_default().chars().take(4000).collect(),
        page: rel.html_url,
        asset_url: asset.map(|a| a.browser_download_url.clone()),
        asset_sha256: asset.and_then(|a| a.digest.as_deref()).and_then(|d| d.strip_prefix("sha256:")).map(|s| s.to_ascii_lowercase()),
        asset_size: asset.map(|a| a.size).unwrap_or(0),
    })
}

fn old_path(exe: &std::path::Path) -> PathBuf {
    exe.with_extension("old.exe")
}

/// Remove the previous exe left behind by an update (it was still running then).
pub fn cleanup_old() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(old_path(&exe));
    }
}

/// Download, verify and swap in the new exe, then schedule a relaunch.
/// The caller exits the app right after this returns Ok.
pub fn install(url: &str, sha256: Option<&str>) -> Result<(), String> {
    // Only ever install files published on this project's GitHub releases.
    let allowed = format!("https://github.com/{REPO}/releases/download/");
    if !url.starts_with(&allowed) {
        return Err("refusing to download an update from outside this project's GitHub releases".into());
    }
    let resp = agent().get(url).call().map_err(|e| format!("download failed: {e}"))?;
    let mut bytes = Vec::new();
    resp.into_reader().take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|e| format!("download failed: {e}"))?;
    if bytes.len() as u64 > MAX_BYTES || bytes.len() < 1024 * 100 {
        return Err("the downloaded update has an unexpected size".into());
    }
    if &bytes[..2] != b"MZ" {
        return Err("the downloaded update isn't a Windows program".into());
    }
    match sha256 {
        Some(expected) => {
            let got = format!("{:x}", Sha256::digest(&bytes));
            if !got.eq_ignore_ascii_case(expected) {
                return Err("the update failed its checksum check and was not installed".into());
            }
        }
        None => return Err("this release has no checksum, so it can't be verified. Download it from GitHub instead.".into()),
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let old = old_path(&exe);
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).map_err(|e| format!("couldn't replace the app file: {e}"))?;
    if let Err(e) = std::fs::write(&exe, &bytes) {
        // Put the original back so the app still starts.
        let _ = std::fs::rename(&old, &exe);
        return Err(format!("couldn't write the update: {e}"));
    }
    relaunch_after_exit(&exe)
}

/// Start the new exe a couple of seconds from now, after this process (and its
/// single-instance lock) is gone.
fn relaunch_after_exit(exe: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let path = exe.to_string_lossy().replace('"', "");
        std::process::Command::new("cmd")
            .raw_arg(format!("/C ping -n 3 127.0.0.1 >NUL & start \"\" \"{path}\""))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("couldn't restart the app: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(exe).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("v1.0.0", "0.99.0"));
        assert!(!is_newer("v0.2.0", "0.2.0"));
        assert!(!is_newer("0.1.9", "0.2.0"));
    }

    /// Talks to GitHub; run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn checks_github() {
        let info = check().expect("check");
        println!("current {} latest {} newer {} asset {:?}", info.current, info.latest, info.newer, info.asset_url);
    }
}
