use md5::{Digest, Md5};
use tauri;

/// Hex-encoded MD5 of a string. Shared so every desktop checksum (the
/// `calculate_md5` command and the parse `sourceMd5`) is byte-identical, which
/// keeps the crash-recovery baseline consistent with the save flow.
pub fn md5_hex(input: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Command to generate an MD5 hash of the input string
///
/// # Arguments
/// * `input` - The input string to hash
///
/// # Returns
/// A `Result` containing the hex-encoded MD5 hash string, or an error message
#[tauri::command]
pub async fn calculate_md5(input: String) -> Result<String, String> {
    Ok(md5_hex(&input))
}
