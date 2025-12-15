use md5::{Digest, Md5};
use tauri;

/// Command to generate an MD5 hash of the input string
///
/// # Arguments
/// * `input` - The input string to hash
///
/// # Returns
/// A `Result` containing the hex-encoded MD5 hash string, or an error message
#[tauri::command]
pub async fn calculate_md5(input: String) -> Result<String, String> {
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    let hex_hash = format!("{:x}", result);
    Ok(hex_hash)
}
