mod git;
mod md5;
mod usfm_onion;
use tauri::Manager;
#[tauri::command]
fn hello_world() -> String {
    "Hello, world!".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    // 1. CONDITIONAL WINDOW_STATE PLUGIN REGISTRATION
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
    }
    builder
        .invoke_handler(tauri::generate_handler![
            md5::calculate_md5,
            usfm_onion::usfm_onion_marker_catalog,
            usfm_onion::usfm_onion_project_usfm,
            usfm_onion::usfm_onion_project_paths,
            usfm_onion::usfm_onion_lint_paths,
            usfm_onion::usfm_onion_lint_tokens,
            usfm_onion::usfm_onion_lint_token_batches,
            usfm_onion::usfm_onion_format_token_batches,
            usfm_onion::usfm_onion_format_paths,
            usfm_onion::usfm_onion_apply_token_fix,
            usfm_onion::usfm_onion_diff_path_pairs,
            usfm_onion::usfm_onion_diff_tokens,
            usfm_onion::usfm_onion_revert_diff_block,
            git::clone_repo,
            git::git_ensure_repo,
            git::git_get_branch_info,
            git::git_checkout_preferred_branch,
            git::git_list_history,
            git::git_read_project_snapshot_at_commit,
            git::git_restore_tracked_files_from_commit,
            git::git_commit_all,
            git::git_is_repo_healthy,
            hello_world
        ])
        .setup(move |app| {
            #[cfg(debug_assertions)]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("Failed to get main window");
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
