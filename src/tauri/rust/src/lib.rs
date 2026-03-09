mod git;
mod md5;
mod parse;
mod usfm_onion;
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::time::Instant;
use std::{fs, io, os};
use tauri::Manager;

use crate::parse::OwnedParsedUSFM;

#[tauri::command]
fn parse_usfm(file_path: String) -> OwnedParsedUSFM {
    let start = Instant::now();
    println!("file path: {}", file_path);
    let str = fs::read_to_string(file_path).expect("file path exists");
    // String::from_utf8(content).expect("Failed to convert Vec<u8> to String in parse_usfm");
    let parsed: parse::OwnedParsedUSFM = parse::OwnedParsedUSFM::from(parse::parse_usfm(&str));

    let elapsed = start.elapsed();
    // let serialization_start = Instant::now();

    // let serialization_elapsed = serialization_start.elapsed();
    // let json = serde_json::to_string(&parsed).unwrap();
    // let u8 = json.as_bytes().to_vec();
    println!("parse_usfm took {:?}", elapsed);
    // println!("Serialization took {:?}", serialization_elapsed);
    parsed
}
#[tauri::command]
fn hello_world() -> String {
    "Hello, world!".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    // 1. CONDITIONAL WINDOW_STATE PLUGIN REGISTRATION
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
    }
    builder
        .invoke_handler(tauri::generate_handler![
            parse_usfm,
            usfm_onion::usfm_onion_project_usfm,
            usfm_onion::usfm_onion_project_path,
            usfm_onion::usfm_onion_project_paths,
            usfm_onion::usfm_onion_tokens_from_usfm,
            usfm_onion::usfm_onion_tokens_from_path,
            usfm_onion::usfm_onion_lint_usfm,
            usfm_onion::usfm_onion_lint_path,
            usfm_onion::usfm_onion_lint_paths,
            usfm_onion::usfm_onion_lint_tokens,
            usfm_onion::usfm_onion_lint_token_batches,
            usfm_onion::usfm_onion_format_tokens,
            usfm_onion::usfm_onion_format_token_batches,
            usfm_onion::usfm_onion_format_paths,
            usfm_onion::usfm_onion_apply_token_fixes,
            usfm_onion::usfm_onion_diff_usfm,
            usfm_onion::usfm_onion_diff_paths,
            usfm_onion::usfm_onion_diff_usfm_by_chapter,
            usfm_onion::usfm_onion_diff_paths_by_chapter,
            usfm_onion::usfm_onion_diff_path_pairs,
            usfm_onion::usfm_onion_diff_tokens,
            usfm_onion::usfm_onion_revert_diff_block,
            usfm_onion::usfm_onion_to_usj,
            usfm_onion::usfm_onion_to_usj_path,
            usfm_onion::usfm_onion_to_usj_paths,
            usfm_onion::usfm_onion_from_usj,
            usfm_onion::usfm_onion_to_usx,
            usfm_onion::usfm_onion_to_usx_path,
            usfm_onion::usfm_onion_to_usx_paths,
            usfm_onion::usfm_onion_from_usx,
            usfm_onion::usfm_onion_to_vref,
            usfm_onion::usfm_onion_to_vref_path,
            usfm_onion::usfm_onion_to_vref_paths,
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
            #[cfg(debug_assertions)] // only include this code on dev builds
            {
                // Your debug assertions code (left commented as before)
                // let window = app
                //     .get_webview_window("main")
                //     .expect("Failed to get main window");
                // // window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
