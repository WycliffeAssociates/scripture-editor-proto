//! Bridge command for the manual version-switch flow in Settings → Advanced.
//!
//! The JS-side `@tauri-apps/plugin-updater` does not expose an endpoint
//! override on its `check()` call, so we cannot point it at the worker's
//! `/{target}/at/{version}` route from TypeScript directly. The Rust-side
//! `UpdaterBuilder` does support endpoint override, so we expose a thin
//! command that builds an updater pinned to a one-off endpoint, runs the
//! same signature-verified download+install path the plugin uses, and
//! returns once the install is staged. Relaunch is handled by the JS caller.

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Url;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_updater::UpdaterExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn install_update_from_endpoint(
    app: tauri::AppHandle,
    endpoint: String,
) -> Result<(), String> {
    let url = Url::parse(&endpoint).map_err(|e| format!("invalid endpoint: {e}"))?;

    // Default updater behavior rejects downgrades (current >= remote). For the
    // manual switch flow we always install whatever the requested endpoint
    // returns, so the comparator unconditionally accepts the remote release.
    let updater = app
        .updater_builder()
        .version_comparator(|_current, _remote| true)
        .endpoints(vec![url])
        .map_err(|e| format!("{e}"))?
        .build()
        .map_err(|e| format!("{e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("{e}"))?
        .ok_or_else(|| "no manifest at the requested endpoint".to_string())?;

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("{e}"))?;

    Ok(())
}

// Mobile stub so the invoke handler list compiles uniformly. Mobile builds
// don't ship the updater plugin; calling this command from a mobile build
// returns an error.
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub async fn install_update_from_endpoint(_endpoint: String) -> Result<(), String> {
    Err("updater not available on mobile".to_string())
}
