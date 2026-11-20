//! Local AI assistants. Runs the coding-agent CLIs the user already has
//! installed and signed in to (Claude Code, Codex, Gemini CLI, Grok CLI), so
//! no API keys ever pass through the app. The prompt goes in over stdin or a
//! temp file and never through the command line, so nothing in it can be
//! read as a shell command.

use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const SKILL: &str = include_str!("../../skills/canvas-notes/SKILL.md");
const TIMEOUT: Duration = Duration::from_secs(240);

#[derive(Serialize, Clone)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub path: String,
}

const TOOLS: [(&str, &str); 4] = [
    ("claude", "Claude Code"),
    ("codex", "Codex"),
    ("gemini", "Gemini CLI"),
    ("grok", "Grok CLI"),
];

#[cfg(windows)]
fn quiet(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW)
}
#[cfg(not(windows))]
fn quiet(cmd: &mut Command) -> &mut Command {
    cmd
}

/// Where the CLI is installed, if anywhere: PATH first, then the usual install folders.
fn locate(id: &str) -> Option<PathBuf> {
    let finder = if cfg!(windows) { "where" } else { "which" };
    if let Ok(out) = quiet(Command::new(finder).arg(id)).stdin(Stdio::null()).output() {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            // Prefer a real program over a shell shim with the same name.
            let mut hits: Vec<PathBuf> = text.lines().map(|l| PathBuf::from(l.trim())).filter(|p| p.is_file()).collect();
            hits.sort_by_key(|p| match ext(p).as_str() {
                "exe" => 0,
                "cmd" | "bat" => 1,
                _ => 2,
            });
            if let Some(p) = hits.into_iter().next() {
                return Some(p);
            }
        }
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from)?;
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    let mut cands = vec![
        home.join(".local").join("bin").join(format!("{id}.exe")),
        home.join(".local").join("bin").join(id),
    ];
    if let Some(a) = appdata {
        cands.push(a.join("npm").join(format!("{id}.cmd")));
    }
    cands.into_iter().find(|p| p.is_file())
}

fn ext(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

pub fn detect() -> Vec<Tool> {
    TOOLS
        .iter()
        .filter_map(|(id, name)| {
            locate(id).map(|p| Tool { id: id.to_string(), name: name.to_string(), path: p.to_string_lossy().into_owned() })
        })
        .collect()
}

/// Write the instructions every CLI looks for into `<vault>/.ai/`.
pub fn prepare_dir(vault: &Path) -> Result<PathBuf, String> {
    let dir = vault.join(".ai");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for name in ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "GROK.md"] {
        let p = dir.join(name);
        if std::fs::read_to_string(&p).ok().as_deref() != Some(SKILL) {
            std::fs::write(&p, SKILL).map_err(|e| e.to_string())?;
        }
    }
    let skill_dir = dir.join(".claude").join("skills").join("canvas-notes");
    std::fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    std::fs::write(skill_dir.join("SKILL.md"), SKILL).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn skill_text() -> &'static str {
    SKILL
}

/// Run one CLI with a prompt and return what it answered.
pub fn run(id: &str, prompt: &str, model: Option<&str>, vault: &Path) -> Result<String, String> {
    let model = model.map(str::trim).filter(|m| !m.is_empty());
    if let Some(m) = model {
        let ok = m.len() <= 64 && m.chars().all(|c| c.is_ascii_alphanumeric() || "._-:/".contains(c));
        if !ok {
            return Err("That model name has characters that aren't allowed".into());
        }
    }
    let exe = locate(id).ok_or_else(|| format!("{id} isn't installed (or isn't on PATH)"))?;
    let dir = prepare_dir(vault)?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let out_file = std::env::temp_dir().join(format!("canvas-notes-ai-{stamp}.txt"));
    let prompt_file = dir.join(format!("prompt-{stamp}.md"));

    // Fixed arguments only; the prompt itself goes through stdin (or a file for Grok).
    let (args, via_stdin): (Vec<String>, bool) = match id {
        "claude" => (
            vec!["-p".into(), "--output-format".into(), "text".into(), "--disallowedTools".into(), "Bash,Edit,Write,NotebookEdit,WebFetch".into()],
            true,
        ),
        "codex" => (
            vec![
                "exec".into(), "--skip-git-repo-check".into(), "--sandbox".into(), "read-only".into(),
                "--ephemeral".into(), "--color".into(), "never".into(), "-o".into(), out_file.to_string_lossy().into_owned(), "-".into(),
            ],
            true,
        ),
        "gemini" => (vec![], true),
        "grok" => {
            std::fs::write(&prompt_file, prompt).map_err(|e| e.to_string())?;
            (vec!["-p".into(), format!("Read the file {} in this folder and do exactly what it asks. Reply with your answer only.", prompt_file.file_name().unwrap().to_string_lossy())], false)
        }
        _ => return Err("unknown assistant".into()),
    };

    let mut args = args;
    if let Some(m) = model {
        let flag = if id == "claude" { "--model" } else { "-m" };
        // Codex reads the prompt from the trailing "-", so the flag goes before it.
        let at = if id == "codex" { args.len() - 1 } else { args.len() };
        args.insert(at, m.to_string());
        args.insert(at, flag.to_string());
    }
    let mut cmd = if matches!(ext(&exe).as_str(), "cmd" | "bat") {
        // npm shims need cmd.exe; every argument here is our own fixed text.
        let mut c = Command::new("cmd");
        c.arg("/D").arg("/C").arg(&exe);
        c
    } else {
        Command::new(&exe)
    };
    cmd.args(&args)
        .current_dir(&dir)
        .stdin(if via_stdin { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NO_COLOR", "1");
    let mut child = quiet(&mut cmd).spawn().map_err(|e| format!("couldn't start {id}: {e}"))?;

    if via_stdin {
        if let Some(mut stdin) = child.stdin.take() {
            let text = prompt.to_string();
            std::thread::spawn(move || {
                let _ = stdin.write_all(text.as_bytes());
            });
        }
    }
    // Read output on threads so a chatty CLI can't fill the pipe and stall.
    let mut so = child.stdout.take().unwrap();
    let mut se = child.stderr.take().unwrap();
    let t_out = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = so.read_to_string(&mut s);
        s
    });
    let t_err = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = se.read_to_string(&mut s);
        s
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if start.elapsed() > TIMEOUT => {
                let _ = child.kill();
                let _ = std::fs::remove_file(&prompt_file);
                return Err(format!("{id} took longer than {} seconds and was stopped", TIMEOUT.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(150)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let stdout = t_out.join().unwrap_or_default();
    let stderr = t_err.join().unwrap_or_default();
    let _ = std::fs::remove_file(&prompt_file);
    let from_file = std::fs::read_to_string(&out_file).ok();
    let _ = std::fs::remove_file(&out_file);

    let answer = from_file.filter(|s| !s.trim().is_empty()).unwrap_or(stdout);
    if !status.success() && answer.trim().is_empty() {
        let tail: String = stderr.lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(if tail.is_empty() { format!("{id} exited with {status}") } else { tail });
    }
    if answer.trim().is_empty() {
        return Err(format!("{id} didn't answer. Is it signed in? Try running it once in a terminal."));
    }
    Ok(answer.trim().to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn skill_is_embedded() {
        assert!(super::skill_text().contains("name: canvas-notes"));
    }
}
