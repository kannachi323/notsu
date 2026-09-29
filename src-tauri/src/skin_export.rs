use std::{
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: usize = 16 * 1024 * 1024;
static SAVING: AtomicBool = AtomicBool::new(false);
struct SaveGuard;
impl Drop for SaveGuard {
    fn drop(&mut self) {
        SAVING.store(false, Ordering::Release);
    }
}

fn validate_request(name: &str, bytes: &[u8]) -> Result<(), String> {
    let stem = name
        .strip_suffix(".notsuskin")
        .ok_or("Invalid skin filename.")?;
    if stem.is_empty()
        || stem.len() > 70
        || !stem
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid skin filename.".into());
    }
    if bytes.len() < 22 || bytes.len() > MAX_BYTES || !bytes.starts_with(b"PK\x03\x04") {
        return Err("A skin export must be a ZIP pack up to 16 MB.".into());
    }
    Ok(())
}

/// Atomic replacement prevents failed writes from truncating an existing pack.
/// The path comes only from the native Save dialog, never an IPC argument.
fn write_pack(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.extension().and_then(|s| s.to_str()) != Some("notsuskin") {
        return Err("Save the pack with the .notsuskin extension.".into());
    }
    let parent = path.parent().ok_or("Choose a file location.")?;
    let mut file = tempfile::Builder::new()
        .prefix(".notsu-export-")
        .tempfile_in(parent)
        .map_err(|e| format!("Could not prepare the skin file: {e}"))?;
    file.write_all(bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|e| format!("Could not write the skin file: {e}"))?;
    file.persist(path)
        .map_err(|e| format!("Could not finish saving the skin: {}", e.error))?;
    Ok(())
}

#[tauri::command]
pub async fn save_skin_pack(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: Request<'_>,
) -> Result<bool, String> {
    if window.label() != "main" {
        return Err("Skin export is only available in the main window.".into());
    }
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary skin data.".into());
    };
    let name = request
        .headers()
        .get("x-skin-name")
        .and_then(|header| header.to_str().ok())
        .ok_or("Missing skin filename.")?;
    validate_request(name, bytes)?;
    if SAVING.swap(true, Ordering::AcqRel) {
        return Err("A skin save dialog is already open.".into());
    }
    let guard = SaveGuard;
    let name = name.to_owned();
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let Some(selected) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Save skin pack")
            .set_file_name(name)
            .add_filter("notsu skin", &["notsuskin"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = selected
            .into_path()
            .map_err(|_| "Choose a local file location.")?;
        write_pack(&path, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|_| "The skin save could not finish.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bytes() -> Vec<u8> {
        let mut result = b"PK\x03\x04".to_vec();
        result.resize(22, 0);
        result
    }
    #[test]
    fn validates_ipc_names_and_size_before_dialog() {
        assert!(validate_request("notsu-my-skin.notsuskin", &bytes()).is_ok());
        for name in [
            "../evil.notsuskin",
            "/file.notsuskin",
            "a\\b.notsuskin",
            "a.png",
            ".notsuskin",
            "a\n.notsuskin",
        ] {
            assert!(validate_request(name, &bytes()).is_err());
        }
        assert!(validate_request("ok.notsuskin", b"not a zip").is_err());
        assert!(validate_request("ok.notsuskin", &vec![0; MAX_BYTES + 1]).is_err());
    }
    #[test]
    fn writes_and_replaces_exact_bytes_without_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chosen.notsuskin");
        write_pack(&path, &bytes()).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes());
        let replacement = [bytes(), vec![4, 5, 6]].concat();
        write_pack(&path, &replacement).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), replacement);
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
    #[test]
    fn invalid_destination_leaves_existing_file_untouched() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("other.txt");
        std::fs::write(&path, b"original").unwrap();
        assert!(write_pack(&path, &bytes()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert!(write_pack(&directory.path().join("missing/file.notsuskin"), &bytes()).is_err());
    }
    #[test]
    fn failed_replacement_cleans_staging_and_preserves_destination() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("occupied.notsuskin");
        std::fs::create_dir(&path).unwrap();
        std::fs::write(path.join("original"), b"keep").unwrap();
        assert!(write_pack(&path, &bytes()).is_err());
        assert_eq!(std::fs::read(path.join("original")).unwrap(), b"keep");
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
