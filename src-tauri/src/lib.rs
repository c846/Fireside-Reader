//! Fireside Reader backend.
//!
//! Everything the app keeps lives in the per-user app data folder
//! (`%APPDATA%\com.fireside.reader` on Windows):
//!
//! - `books/<id>.<ext>`   private copies of every book that was opened
//! - `covers/<id>.txt`    cover thumbnails as data URLs
//! - `library.json`       book metadata, reading positions and bookmarks
//! - `settings.json`      theme, font and layout preferences
//! - `background/`        the chosen background image, if any
//!
//! A book's id is derived from a hash of its contents, so opening the
//! same file twice reuses the existing copy.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn valid_id(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_hexdigit())
}

fn valid_ext(ext: &str) -> bool {
    matches!(ext, "epub" | "txt")
}

/// Writes through a temporary file so a crash mid-write never leaves a
/// half-written library behind.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Only a fixed set of names may be read or written from the frontend.
fn data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let allowed = match name.split_once('/') {
        None => matches!(name, "library.json" | "settings.json"),
        Some(("covers", file)) => file.strip_suffix(".txt").is_some_and(valid_id),
        _ => false,
    };
    if !allowed {
        return Err(format!("Refusing to access '{name}'"));
    }
    Ok(data_dir(app)?.join(name))
}

fn book_path(app: &AppHandle, id: &str, ext: &str) -> Result<PathBuf, String> {
    if !valid_id(id) || !valid_ext(ext) {
        return Err("Invalid book id".into());
    }
    Ok(data_dir(app)?.join("books").join(format!("{id}.{ext}")))
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Imported {
    id: String,
    ext: String,
    file_name: String,
    existed: bool,
}

/// The Windows display name when there is one, otherwise the account name.
#[tauri::command]
fn get_user_name() -> String {
    let real = whoami::realname();
    let real = real.trim();
    if real.is_empty() || real.eq_ignore_ascii_case("unknown") {
        whoami::username()
    } else {
        real.to_string()
    }
}

/// Font families installed on the system, sorted case-insensitively.
#[tauri::command]
async fn list_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut families = font_kit::source::SystemSource::new()
            .all_families()
            .unwrap_or_default();
        // '@' families are vertical-text variants, not useful here.
        families.retain(|f| !f.starts_with('@') && !f.trim().is_empty());
        families.sort_by_key(|f| f.to_lowercase());
        families.dedup();
        families
    })
    .await
    .unwrap_or_default()
}

/// Copies a book into the app folder so it survives the original being deleted.
#[tauri::command]
async fn import_book(app: AppHandle, path: String) -> Result<Imported, String> {
    let src = PathBuf::from(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !valid_ext(&ext) {
        return Err("Only .epub and .txt files are supported.".into());
    }
    let bytes = fs::read(&src).map_err(|e| format!("Couldn't read that file: {e}"))?;
    let id: String = Sha256::digest(&bytes)
        .iter()
        .take(12)
        .map(|b| format!("{b:02x}"))
        .collect();
    let dest = book_path(&app, &id, &ext)?;
    let existed = dest.exists();
    if !existed {
        write_atomic(&dest, &bytes)?;
    }
    let file_name = src
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".into());
    Ok(Imported { id, ext, file_name, existed })
}

/// Returns the saved copy's raw bytes (arrives as an ArrayBuffer in JS).
#[tauri::command]
async fn read_book(app: AppHandle, id: String, ext: String) -> Result<tauri::ipc::Response, String> {
    let path = book_path(&app, &id, &ext)?;
    let bytes =
        fs::read(&path).map_err(|e| format!("Couldn't open the saved copy of this book: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn remove_book(app: AppHandle, id: String, ext: String) -> Result<(), String> {
    remove_if_exists(&book_path(&app, &id, &ext)?)?;
    remove_if_exists(&data_file(&app, &format!("covers/{id}.txt"))?)
}

#[tauri::command]
async fn load_data(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = data_file(&app, &name)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn save_data(app: AppHandle, name: String, content: String) -> Result<(), String> {
    write_atomic(&data_file(&app, &name)?, content.as_bytes())
}

const IMAGE_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

fn background_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("background"))
}

fn clear_background_dir(app: &AppHandle) -> Result<(), String> {
    let dir = background_dir(app)?;
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            remove_if_exists(&entry.path())?;
        }
    }
    Ok(())
}

/// Copies the chosen image into the app folder (replacing any earlier one)
/// and returns its extension.
#[tauri::command]
async fn set_background(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Please choose a PNG, JPEG, WebP, GIF or BMP image.".into());
    }
    let bytes = fs::read(&src).map_err(|e| format!("Couldn't read that image: {e}"))?;
    clear_background_dir(&app)?;
    write_atomic(&background_dir(&app)?.join(format!("current.{ext}")), &bytes)?;
    Ok(ext)
}

#[tauri::command]
async fn read_background(app: AppHandle, ext: String) -> Result<tauri::ipc::Response, String> {
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Invalid image type".into());
    }
    let bytes = fs::read(background_dir(&app)?.join(format!("current.{ext}")))
        .map_err(|e| format!("Couldn't load the background image: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn clear_background(app: AppHandle) -> Result<(), String> {
    clear_background_dir(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_user_name,
            list_fonts,
            import_book,
            read_book,
            remove_book,
            load_data,
            save_data,
            set_background,
            read_background,
            clear_background
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fireside Reader");
}
