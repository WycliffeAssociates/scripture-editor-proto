use std::path::PathBuf;

use git2::Repository;

#[tauri::command]
pub fn clone_repo(url: String, path: String) -> Result<(), String> {
    // Extract last path segment from URL
    // Remove trailing `/`, then split and take last segment
    let repo_name = url
        .trim_end_matches('/')
        .split('/')
        .last()
        .filter(|s| !s.is_empty()) // reject empty
        .map(|s| s.strip_suffix(".git").unwrap_or(s)) // strip ".git" if present
        .ok_or_else(|| "Invalid repository URL".to_string())?;

    // Build a filesystem path
    let fs_path = PathBuf::from(path).join(repo_name);

    // Clone directly into the path, propagate error with `?`
    Repository::clone(&url, &fs_path).map_err(|e| e.message().to_string())?;

    Ok(())
}
