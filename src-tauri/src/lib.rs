//! Canvas Notes backend.
//!
//! Layout of a vault:
//!   <vault>/boards/<board-id>.json        one file per board
//!   <vault>/assets/<file>                 images, files and voice notes
//!   <vault>/.history/<board-id>/<ms>.json automatic snapshots (version history)
//!
//! The app keeps running in the system tray when its window is closed, so
//! due-date reminders and the quick-capture hotkey keep working.

mod ai;
mod preview;
mod updater;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+Space";
/// At most one automatic snapshot per board in this window.
const SNAPSHOT_EVERY_MS: u128 = 10 * 60 * 1000;
const SNAPSHOTS_KEPT: usize = 60;

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct Config {
    vault: Option<String>,
    close_to_tray: bool,
    capture_shortcut: String,
    /// Install new GitHub releases automatically on startup.
    auto_update: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config { vault: None, close_to_tray: true, capture_shortcut: DEFAULT_SHORTCUT.into(), auto_update: false }
    }
}

struct AppState {
    config_path: PathBuf,
    config: Mutex<Config>,
    vault: Mutex<PathBuf>,
}

impl AppState {
    fn save_config(&self) -> CmdResult<()> {
        let cfg = self.config.lock().unwrap().clone();
        write_atomic(&self.config_path, serde_json::to_string_pretty(&cfg).map_err(err)?.as_bytes())
    }
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Only allow simple ids / file names so nothing can escape the vault.
fn safe_name(name: &str) -> CmdResult<&str> {
    let ok = !name.is_empty()
        && name.len() < 160
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !name.starts_with('.');
    if ok {
        Ok(name)
    } else {
        Err(format!("invalid name: {name}"))
    }
}

fn ensure_vault(dir: &Path) -> CmdResult<()> {
    fs::create_dir_all(dir.join("boards")).map_err(err)?;
    fs::create_dir_all(dir.join("assets")).map_err(err)?;
    Ok(())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> CmdResult<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "webm" => "audio/webm",
        "ogg" | "oga" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "pdf" => "application/pdf",
        "txt" | "md" => "text/plain",
        _ => "application/octet-stream",
    }
}

/* ---------------- vault & boards ---------------- */

#[tauri::command]
fn vault_path(state: State<AppState>) -> String {
    state.vault.lock().unwrap().to_string_lossy().into_owned()
}

#[tauri::command]
fn set_vault(path: String, state: State<AppState>) -> CmdResult<String> {
    let dir = PathBuf::from(&path);
    ensure_vault(&dir)?;
    *state.vault.lock().unwrap() = dir;
    state.config.lock().unwrap().vault = Some(path.clone());
    state.save_config()?;
    Ok(path)
}

#[tauri::command]
fn list_boards(state: State<AppState>) -> CmdResult<Vec<serde_json::Value>> {
    let dir = state.vault.lock().unwrap().join("boards");
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(err)? {
        let p = entry.map_err(err)?.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match fs::read_to_string(&p).ok().and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()) {
            Some(v) => out.push(v),
            None => eprintln!("skipping unreadable board {}", p.display()),
        }
    }
    Ok(out)
}

fn history_dir(vault: &Path, id: &str) -> PathBuf {
    vault.join(".history").join(id)
}

/// Sorted (oldest first) snapshot timestamps for a board.
fn snapshot_times(dir: &Path) -> Vec<u128> {
    let mut v: Vec<u128> = fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter_map(|e| e.path().file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse().ok()))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

fn write_snapshot(vault: &Path, id: &str, data: &str, force: bool) -> CmdResult<()> {
    let dir = history_dir(vault, id);
    let times = snapshot_times(&dir);
    let now = now_ms();
    if !force && times.last().is_some_and(|&t| now.saturating_sub(t) < SNAPSHOT_EVERY_MS) {
        return Ok(());
    }
    fs::create_dir_all(&dir).map_err(err)?;
    write_atomic(&dir.join(format!("{now}.json")), data.as_bytes())?;
    let times = snapshot_times(&dir);
    if times.len() > SNAPSHOTS_KEPT {
        for t in &times[..times.len() - SNAPSHOTS_KEPT] {
            let _ = fs::remove_file(dir.join(format!("{t}.json")));
        }
    }
    Ok(())
}

#[tauri::command]
fn save_board(id: String, data: String, state: State<AppState>) -> CmdResult<()> {
    let id = safe_name(&id)?;
    // Validate before touching disk so a bad payload never clobbers a board.
    serde_json::from_str::<serde_json::Value>(&data).map_err(err)?;
    let vault = state.vault.lock().unwrap().clone();
    write_atomic(&vault.join("boards").join(format!("{id}.json")), data.as_bytes())?;
    if let Err(e) = write_snapshot(&vault, id, &data, false) {
        eprintln!("snapshot failed for {id}: {e}");
    }
    Ok(())
}

#[tauri::command]
fn delete_board(id: String, state: State<AppState>) -> CmdResult<()> {
    let id = safe_name(&id)?;
    let vault = state.vault.lock().unwrap().clone();
    let path = vault.join("boards").join(format!("{id}.json"));
    if path.exists() {
        // Keep one last snapshot so a deleted board can still be found in history on disk.
        if let Ok(data) = fs::read_to_string(&path) {
            let _ = write_snapshot(&vault, id, &data, true);
        }
        fs::remove_file(path).map_err(err)?;
    }
    Ok(())
}

/// Vault-level settings shared by all boards (workspaces list).
#[tauri::command]
fn read_meta(state: State<AppState>) -> CmdResult<String> {
    let path = state.vault.lock().unwrap().join("workspaces.json");
    Ok(fs::read_to_string(path).unwrap_or_default())
}

#[tauri::command]
fn write_meta(data: String, state: State<AppState>) -> CmdResult<()> {
    serde_json::from_str::<serde_json::Value>(&data).map_err(err)?;
    let path = state.vault.lock().unwrap().join("workspaces.json");
    write_atomic(&path, data.as_bytes())
}

/// Small vault-level JSON files (templates, fonts, sync settings). Only known names are allowed.
const VAULT_FILES: &[&str] = &["templates.json", "fonts.json", "sync.json"];

#[tauri::command]
fn read_vault_file(name: String, state: State<AppState>) -> CmdResult<String> {
    if !VAULT_FILES.contains(&name.as_str()) {
        return Err(format!("unknown vault file {name}"));
    }
    Ok(fs::read_to_string(state.vault.lock().unwrap().join(&name)).unwrap_or_default())
}

#[tauri::command]
fn write_vault_file(name: String, data: String, state: State<AppState>) -> CmdResult<()> {
    if !VAULT_FILES.contains(&name.as_str()) {
        return Err(format!("unknown vault file {name}"));
    }
    serde_json::from_str::<serde_json::Value>(&data).map_err(err)?;
    write_atomic(&state.vault.lock().unwrap().join(&name), data.as_bytes())
}

#[derive(Serialize)]
struct Snapshot {
    ts: u64,
    size: u64,
}

#[tauri::command]
fn list_history(id: String, state: State<AppState>) -> CmdResult<Vec<Snapshot>> {
    let id = safe_name(&id)?;
    let dir = history_dir(&state.vault.lock().unwrap(), id);
    let mut out: Vec<Snapshot> = snapshot_times(&dir)
        .into_iter()
        .map(|t| Snapshot { ts: t as u64, size: fs::metadata(dir.join(format!("{t}.json"))).map(|m| m.len()).unwrap_or(0) })
        .collect();
    out.reverse();
    Ok(out)
}

#[tauri::command]
fn read_history(id: String, ts: u64, state: State<AppState>) -> CmdResult<String> {
    let id = safe_name(&id)?;
    let path = history_dir(&state.vault.lock().unwrap(), id).join(format!("{ts}.json"));
    fs::read_to_string(path).map_err(err)
}

#[tauri::command]
fn snapshot_now(id: String, data: String, state: State<AppState>) -> CmdResult<()> {
    let id = safe_name(&id)?;
    serde_json::from_str::<serde_json::Value>(&data).map_err(err)?;
    write_snapshot(&state.vault.lock().unwrap(), id, &data, true)
}

/* ---------------- assets ---------------- */

#[tauri::command]
fn save_asset(name: String, data_b64: String, state: State<AppState>) -> CmdResult<String> {
    let name = safe_name(&name)?;
    let bytes = B64.decode(data_b64.as_bytes()).map_err(err)?;
    let path = state.vault.lock().unwrap().join("assets").join(name);
    write_atomic(&path, &bytes)?;
    Ok(name.to_string())
}

#[tauri::command]
fn read_asset(name: String, state: State<AppState>) -> CmdResult<String> {
    let name = safe_name(&name)?;
    let path = state.vault.lock().unwrap().join("assets").join(name);
    let bytes = fs::read(&path).map_err(err)?;
    Ok(format!("data:{};base64,{}", mime_for(&path), B64.encode(bytes)))
}

/// Copy a file the user picked straight into the vault (no base64 round trip).
#[tauri::command]
fn import_asset_path(path: String, name: String, state: State<AppState>) -> CmdResult<u64> {
    let name = safe_name(&name)?;
    let dest = state.vault.lock().unwrap().join("assets").join(name);
    fs::copy(&path, &dest).map_err(err)
}

/// Open an attached file with its default Windows program.
#[tauri::command]
fn open_asset(app: AppHandle, name: String, state: State<AppState>) -> CmdResult<()> {
    let name = safe_name(&name)?;
    let path = state.vault.lock().unwrap().join("assets").join(name);
    if !path.exists() {
        return Err("that file is missing from the vault".into());
    }
    // Boards can be shared, so never launch programs or scripts from an attachment.
    const BLOCKED: &[&str] = &[
        "exe", "com", "bat", "cmd", "msi", "msp", "scr", "pif", "cpl", "ps1", "psm1", "vbs", "vbe", "js", "jse",
        "wsf", "wsh", "hta", "jar", "lnk", "reg", "dll", "sys", "appx", "msix", "application", "gadget", "inf", "url",
    ];
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if BLOCKED.contains(&ext.as_str()) {
        return Err(format!("for safety, .{ext} files can't be opened from a card. Use Save a copy instead."));
    }
    app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(err)
}

/// Save an attached file somewhere the user picked.
#[tauri::command]
fn copy_asset_to(name: String, path: String, state: State<AppState>) -> CmdResult<()> {
    let name = safe_name(&name)?;
    let src = state.vault.lock().unwrap().join("assets").join(name);
    fs::copy(src, path).map(|_| ()).map_err(err)
}

/* ---------------- import / export ---------------- */

/// Write an export to a path the user picked in the save dialog.
#[tauri::command]
fn export_file(path: String, data: String) -> CmdResult<()> {
    fs::write(PathBuf::from(path), data.as_bytes()).map_err(err)
}

/// Write binary data (PNG / PDF exports) to a path the user picked.
#[tauri::command]
fn export_binary(path: String, data_b64: String) -> CmdResult<()> {
    let bytes = B64.decode(data_b64.as_bytes()).map_err(err)?;
    fs::write(PathBuf::from(path), bytes).map_err(err)
}

/// Read a file the user picked in the open dialog (board / settings import).
#[tauri::command]
fn import_file(path: String) -> CmdResult<String> {
    let meta = fs::metadata(&path).map_err(err)?;
    if meta.len() > 512 * 1024 * 1024 {
        return Err("file is larger than 512 MB".into());
    }
    fs::read_to_string(path).map_err(err)
}

/* ---------------- local AI assistants ---------------- */

#[tauri::command]
async fn ai_detect() -> Vec<ai::Tool> {
    tauri::async_runtime::spawn_blocking(ai::detect).await.unwrap_or_default()
}

#[tauri::command]
async fn ai_run(tool: String, prompt: String, model: Option<String>, state: State<'_, AppState>) -> CmdResult<String> {
    if prompt.len() > 400_000 {
        return Err("That's too much text to send in one go".into());
    }
    let vault = state.vault.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || ai::run(&tool, &prompt, model.as_deref(), &vault)).await.map_err(err)?
}

/// Write the agent instructions into the vault and return the folder (for "open in terminal" use).
#[tauri::command]
fn ai_prepare(state: State<AppState>) -> CmdResult<String> {
    let vault = state.vault.lock().unwrap().clone();
    ai::prepare_dir(&vault).map(|p| p.to_string_lossy().into_owned())
}

/* ---------------- web ---------------- */

#[tauri::command]
async fn fetch_preview(url: String) -> CmdResult<preview::Preview> {
    tauri::async_runtime::spawn_blocking(move || preview::fetch(&url)).await.map_err(err)?
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> CmdResult<()> {
    let u = url::Url::parse(&url).map_err(err)?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return Err("only web links can be opened".into());
    }
    app.opener().open_url(u.as_str(), None::<&str>).map_err(err)
}

/* ---------------- app behaviour ---------------- */

#[derive(Serialize)]
struct Prefs {
    close_to_tray: bool,
    capture_shortcut: String,
    auto_update: bool,
    version: String,
}

#[tauri::command]
fn get_prefs(state: State<AppState>) -> Prefs {
    let c = state.config.lock().unwrap();
    Prefs {
        close_to_tray: c.close_to_tray,
        capture_shortcut: c.capture_shortcut.clone(),
        auto_update: c.auto_update,
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

#[tauri::command]
fn set_auto_update(on: bool, state: State<AppState>) -> CmdResult<()> {
    state.config.lock().unwrap().auto_update = on;
    state.save_config()
}

#[tauri::command]
async fn check_update() -> CmdResult<updater::UpdateInfo> {
    tauri::async_runtime::spawn_blocking(updater::check).await.map_err(err)?
}

/// Download + verify + swap the exe, then quit so the new version can start.
#[tauri::command]
async fn install_update(app: AppHandle, url: String, sha256: Option<String>) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || updater::install(&url, sha256.as_deref())).await.map_err(err)??;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn set_close_to_tray(on: bool, state: State<AppState>) -> CmdResult<()> {
    state.config.lock().unwrap().close_to_tray = on;
    state.save_config()
}

#[tauri::command]
fn set_capture_shortcut(app: AppHandle, shortcut: String, state: State<AppState>) -> CmdResult<String> {
    let new: Shortcut = shortcut.parse().map_err(|e| format!("that shortcut isn't valid: {e}"))?;
    let gs = app.global_shortcut();
    let old = state.config.lock().unwrap().capture_shortcut.clone();
    if let Ok(o) = old.parse::<Shortcut>() {
        let _ = gs.unregister(o);
    }
    if let Err(e) = gs.register(new) {
        // Put the old one back so the hotkey never silently disappears.
        if let Ok(o) = old.parse::<Shortcut>() {
            let _ = gs.register(o);
        }
        return Err(format!("couldn't use that shortcut (another app may own it): {e}"));
    }
    state.config.lock().unwrap().capture_shortcut = shortcut.clone();
    state.save_config()?;
    Ok(shortcut)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn show_capture(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch focuses the running app instead of opening a copy that
        // could overwrite the same boards.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_capture(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            updater::cleanup_old();
            let config_dir = app.path().app_config_dir()?;
            fs::create_dir_all(&config_dir)?;
            let config_path = config_dir.join("config.json");
            let cfg: Config = fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            let vault = match &cfg.vault {
                Some(v) => PathBuf::from(v),
                None => app.path().document_dir()?.join("Canvas Notes"),
            };
            ensure_vault(&vault).map_err(anyhow::Error::msg)?;
            let shortcut = cfg.capture_shortcut.clone();
            app.manage(AppState { config_path, config: Mutex::new(cfg), vault: Mutex::new(vault) });

            if let Ok(sc) = shortcut.parse::<Shortcut>() {
                if let Err(e) = app.global_shortcut().register(sc) {
                    eprintln!("quick capture shortcut unavailable: {e}");
                }
            }

            // Small always-on-top window for quick capture; hidden until the hotkey.
            WebviewWindowBuilder::new(app, "capture", WebviewUrl::App("index.html?capture=1".into()))
                .title("Quick capture")
                .inner_size(560.0, 260.0)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .center()
                .build()?;

            let open = MenuItem::with_id(app, "open", "Open Canvas Notes", true, None::<&str>)?;
            let capture = MenuItem::with_id(app, "capture", "Quick capture", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &capture, &PredefinedMenuItem::separator(app)?, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Canvas Notes")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "open" => show_main(app),
                    "capture" => show_capture(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Started with Windows: stay in the tray until opened.
            if !std::env::args().any(|a| a == "--minimized") {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let to_tray = app.state::<AppState>().config.lock().unwrap().close_to_tray;
                if window.label() == "capture" || to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    app.exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            vault_path,
            set_vault,
            list_boards,
            save_board,
            delete_board,
            read_meta,
            write_meta,
            read_vault_file,
            write_vault_file,
            list_history,
            read_history,
            snapshot_now,
            save_asset,
            read_asset,
            import_asset_path,
            open_asset,
            copy_asset_to,
            export_file,
            export_binary,
            import_file,
            fetch_preview,
            open_url,
            get_prefs,
            set_close_to_tray,
            set_capture_shortcut,
            set_auto_update,
            check_update,
            install_update,
            ai_detect,
            ai_run,
            ai_prepare,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running Canvas Notes");
}
