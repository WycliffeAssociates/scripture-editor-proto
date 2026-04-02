use std::collections::BTreeMap;
use std::fs;
use std::io::{BufReader, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

const COPY_PROGRESS_EMIT_INTERVAL: usize = 50;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgressPayload {
    phase: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    current: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<usize>,
}

struct CopyProgressState {
    copied_files: usize,
    total_files: usize,
}

enum ExtractedTopLevel {
    Directory(PathBuf),
    File(PathBuf),
}

#[tauri::command]
pub fn import_copy_directory_to_managed_storage(
    app: AppHandle,
    source_path: String,
    projects_root: String,
    progress_event: String,
) -> Result<String, String> {
    let mut emit_progress = |payload: ImportProgressPayload| {
        app.emit(progress_event.as_str(), payload)
            .map_err(|error| error.to_string())
    };

    let destination = copy_directory_into_managed_storage(
        Path::new(&source_path),
        Path::new(&projects_root),
        &mut emit_progress,
        &|source, destination| fs::copy(source, destination).map(|_| ()),
    )?;

    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_extract_zip_to_managed_storage(
    app: AppHandle,
    archive_path: String,
    projects_root: String,
    temp_root: String,
    progress_event: String,
) -> Result<String, String> {
    let mut emit_progress = |payload: ImportProgressPayload| {
        app.emit(progress_event.as_str(), payload)
            .map_err(|error| error.to_string())
    };

    let destination = extract_zip_into_managed_storage(
        Path::new(&archive_path),
        Path::new(&projects_root),
        Path::new(&temp_root),
        &mut emit_progress,
        &|source, destination| fs::copy(source, destination).map(|_| ()),
    )?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn import_download_remote_archive_to_managed_storage(
    app: AppHandle,
    url: String,
    projects_root: String,
    temp_root: String,
    progress_event: String,
    requested_with_header_value: Option<String>,
) -> Result<String, String> {
    let mut emit_progress = |payload: ImportProgressPayload| {
        app.emit(progress_event.as_str(), payload)
            .map_err(|error| error.to_string())
    };

    let destination = download_remote_archive_into_managed_storage(
        url.as_str(),
        Path::new(&projects_root),
        Path::new(&temp_root),
        &mut emit_progress,
        &|url, temp_root, emit_progress| {
            download_remote_archive_to_temp(
                url,
                temp_root,
                emit_progress,
                requested_with_header_value.as_deref(),
            )
        },
        &|source, destination| fs::copy(source, destination).map(|_| ()),
    )?;

    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn finalize_imported_resource(
    app: AppHandle,
    resource_path: String,
    progress_event: String,
) -> Result<(), String> {
    let mut emit_progress = |payload: ImportProgressPayload| {
        app.emit(progress_event.as_str(), payload)
            .map_err(|error| error.to_string())
    };

    finalize_imported_resource_in_place(Path::new(&resource_path), &mut emit_progress)
}

fn copy_directory_into_managed_storage<F, C>(
    source_path: &Path,
    projects_root: &Path,
    emit_progress: &mut F,
    copy_file: &C,
) -> Result<PathBuf, String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
    C: Fn(&Path, &Path) -> std::io::Result<()>,
{
    if !source_path.is_dir() {
        return Err(format!(
            "Source path is not a directory: {}",
            source_path.display()
        ));
    }

    fs::create_dir_all(projects_root).map_err(|error| {
        format!(
            "Failed to prepare managed projects storage {}: {}",
            projects_root.display(),
            error
        )
    })?;

    let initial_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| {
            format!(
                "Source directory does not have a usable folder name: {}",
                source_path.display()
            )
        })?;
    let destination = resolve_unique_destination(projects_root, initial_name)?;
    fs::create_dir_all(&destination).map_err(|error| {
        format!(
            "Failed to create destination directory {}: {}",
            destination.display(),
            error
        )
    })?;

    let result = (|| -> Result<(), String> {
        let total_files = count_files(source_path)?;
        emit_progress(copy_progress_payload(0, total_files))?;

        let mut progress = CopyProgressState {
            copied_files: 0,
            total_files,
        };
        copy_directory_contents(
            source_path,
            &destination,
            emit_progress,
            copy_file,
            &mut progress,
        )
    })();

    if let Err(error) = result {
        let cleanup_error = remove_partial_destination(&destination).err();
        let message = match cleanup_error {
            Some(cleanup_error) => format!(
                "Failed to copy source directory into app storage: {error}. Cleanup also failed: {cleanup_error}"
            ),
            None => format!("Failed to copy source directory into app storage: {error}"),
        };
        let _ = emit_progress(failed_payload(message.as_str()));
        return Err(message);
    }

    Ok(destination)
}

fn extract_zip_into_managed_storage<F, C>(
    archive_path: &Path,
    projects_root: &Path,
    temp_root: &Path,
    emit_progress: &mut F,
    copy_file: &C,
) -> Result<PathBuf, String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
    C: Fn(&Path, &Path) -> std::io::Result<()>,
{
    if !archive_path.is_file() {
        return Err(format!(
            "Archive path is not a file: {}",
            archive_path.display()
        ));
    }

    fs::create_dir_all(projects_root).map_err(|error| {
        format!(
            "Failed to prepare managed projects storage {}: {}",
            projects_root.display(),
            error
        )
    })?;
    fs::create_dir_all(temp_root).map_err(|error| {
        format!(
            "Failed to prepare temporary storage {}: {}",
            temp_root.display(),
            error
        )
    })?;

    let temp_extraction_dir = build_temp_extraction_dir(archive_path, temp_root);
    fs::create_dir_all(&temp_extraction_dir).map_err(|error| {
        format!(
            "Failed to create temporary extraction directory {}: {}",
            temp_extraction_dir.display(),
            error
        )
    })?;

    let mut destination_path: Option<PathBuf> = None;
    let result = (|| -> Result<PathBuf, String> {
        let extraction = extract_zip_to_temp(archive_path, &temp_extraction_dir, emit_progress)?;
        let destination =
            resolve_unique_destination(projects_root, extraction.top_level_name.as_str())?;
        fs::create_dir_all(&destination).map_err(|error| {
            format!(
                "Failed to create destination directory {}: {}",
                destination.display(),
                error
            )
        })?;
        destination_path = Some(destination.clone());

        emit_progress(copy_archive_progress_payload(
            0,
            extraction.extracted_file_count,
        ))?;
        let mut progress = CopyProgressState {
            copied_files: 0,
            total_files: extraction.extracted_file_count,
        };
        copy_extracted_top_level_to_destination(
            &extraction.top_level_entry,
            &destination,
            emit_progress,
            copy_file,
            &mut progress,
        )?;

        Ok(destination)
    })();

    let cleanup_error = remove_partial_destination(&temp_extraction_dir).err();
    if result.is_err() {
        if let Some(destination_path) = &destination_path {
            if let Err(cleanup_error) = remove_partial_destination(destination_path) {
                let message = format!(
                    "Failed to clean up partial destination {}: {}",
                    destination_path.display(),
                    cleanup_error
                );
                let _ = emit_progress(failed_payload(message.as_str()));
                return Err(message);
            }
        }
    }
    if let Some(cleanup_error) = cleanup_error {
        let message = format!(
            "Failed to clean up temporary extraction directory {}: {}",
            temp_extraction_dir.display(),
            cleanup_error
        );
        let _ = emit_progress(failed_payload(message.as_str()));
        return Err(message);
    }

    match result {
        Ok(destination) => Ok(destination),
        Err(error) => {
            let message = format!("Failed to extract archive into app storage: {error}");
            let _ = emit_progress(failed_payload(message.as_str()));
            Err(message)
        }
    }
}

fn download_remote_archive_into_managed_storage<F, D, C>(
    url: &str,
    projects_root: &Path,
    temp_root: &Path,
    emit_progress: &mut F,
    download_archive: &D,
    copy_file: &C,
) -> Result<PathBuf, String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
    D: Fn(&str, &Path, &mut F) -> Result<PathBuf, String>,
    C: Fn(&Path, &Path) -> std::io::Result<()>,
{
    let staged_archive_path = download_archive(url, temp_root, emit_progress)?;
    let result = extract_zip_into_managed_storage(
        &staged_archive_path,
        projects_root,
        temp_root,
        emit_progress,
        copy_file,
    );
    let cleanup_result = remove_file_if_exists(&staged_archive_path);

    match (result, cleanup_result) {
        (Ok(destination), Ok(())) => Ok(destination),
        (Ok(_), Err(cleanup_error)) => {
            let message = format!(
                "Failed to clean up downloaded archive {}: {}",
                staged_archive_path.display(),
                cleanup_error
            );
            let _ = emit_progress(failed_payload(message.as_str()));
            Err(message)
        }
        (Err(error), Ok(())) => Err(error),
        (Err(error), Err(cleanup_error)) => {
            let message = format!(
                "{error}. Cleanup also failed for {}: {}",
                staged_archive_path.display(),
                cleanup_error
            );
            let _ = emit_progress(failed_payload(message.as_str()));
            Err(message)
        }
    }
}

fn resolve_unique_destination(projects_root: &Path, initial_name: &str) -> Result<PathBuf, String> {
    let mut counter = 0usize;
    let mut candidate = projects_root.join(initial_name);

    while candidate.exists() {
        counter += 1;
        candidate = projects_root.join(format!("{initial_name} ({counter})"));
    }

    Ok(candidate)
}

fn build_temp_extraction_dir(archive_path: &Path, temp_root: &Path) -> PathBuf {
    let archive_name = archive_path
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("archive");
    temp_root.join(format!("{archive_name}-extract-{}", unique_nonce()))
}

fn build_temp_archive_path(url: &str, temp_root: &Path) -> PathBuf {
    let archive_name = filename_from_url(url).unwrap_or_else(|| "download.zip".to_string());
    temp_root.join(format!("{}-{}", unique_nonce(), archive_name))
}

fn filename_from_url(url: &str) -> Option<String> {
    let trimmed = url.split('?').next().unwrap_or(url).trim_end_matches('/');
    trimmed
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
}

fn unique_nonce() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_nanos()
}

fn download_remote_archive_to_temp<F>(
    url: &str,
    temp_root: &Path,
    emit_progress: &mut F,
    requested_with_header_value: Option<&str>,
) -> Result<PathBuf, String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
{
    fs::create_dir_all(temp_root).map_err(|error| {
        format!(
            "Failed to prepare temporary storage {}: {}",
            temp_root.display(),
            error
        )
    })?;

    let temp_archive_path = build_temp_archive_path(url, temp_root);
    let client = Client::builder()
        .build()
        .map_err(|error| format!("Failed to initialize HTTP client: {}", error))?;
    let mut request = client.get(url);
    if let Some(value) = requested_with_header_value.filter(|value| !value.trim().is_empty()) {
        request = request.header("X-Requested-With", value);
    }
    let mut response = request
        .send()
        .map_err(|error| format!("Failed to download remote archive {url}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let headers = format!("{:?}", response.headers());
        let body = response.text().unwrap_or_default();
        let body_preview = if body.len() > 500 {
            format!("{}...", &body[..500])
        } else {
            body
        };
        eprintln!(
            "[import_download_remote_archive_to_managed_storage] Remote archive download failed. url={url} status={} headers={} body={}",
            status,
            headers,
            body_preview
        );
        return Err(format!(
            "Download failed with status: {} {}",
            status.as_u16(),
            status
                .canonical_reason()
                .unwrap_or("Unknown Status")
        ));
    }

    let total = response
        .content_length()
        .and_then(|value| usize::try_from(value).ok());
    emit_progress(read_source_payload(url, 0, total))?;

    let mut output = fs::File::create(&temp_archive_path).map_err(|error| {
        format!(
            "Failed to create temporary archive {}: {}",
            temp_archive_path.display(),
            error
        )
    })?;
    let mut downloaded = 0usize;
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let bytes_read = response
            .read(&mut buffer)
            .map_err(|error| format!("Failed while downloading {url}: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        output.write_all(&buffer[..bytes_read]).map_err(|error| {
            format!(
                "Failed to write temporary archive {}: {}",
                temp_archive_path.display(),
                error
            )
        })?;
        downloaded += bytes_read;
        if downloaded % (256 * 1024) < bytes_read {
            emit_progress(read_source_payload(url, downloaded, total))?;
        }
    }

    emit_progress(read_source_payload(url, downloaded, total))?;
    Ok(temp_archive_path)
}

fn count_files(source_path: &Path) -> Result<usize, String> {
    let mut total_files = 0usize;
    let read_dir = fs::read_dir(source_path).map_err(|error| {
        format!(
            "Failed to read directory {}: {}",
            source_path.display(),
            error
        )
    })?;

    for entry_result in read_dir {
        let entry = entry_result.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        if file_name.to_string_lossy() == ".git" {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to inspect {}: {}", entry_path.display(), error))?;
        if metadata.is_dir() {
            total_files += count_files(&entry_path)?;
        } else if metadata.is_file() {
            total_files += 1;
        }
    }

    Ok(total_files)
}

fn count_files_in_top_level(entry: &ExtractedTopLevel) -> Result<usize, String> {
    match entry {
        ExtractedTopLevel::Directory(path) => count_files(path),
        ExtractedTopLevel::File(_) => Ok(1),
    }
}

fn copy_extracted_top_level_to_destination<F, C>(
    top_level_entry: &ExtractedTopLevel,
    destination_path: &Path,
    emit_progress: &mut F,
    copy_file: &C,
    progress: &mut CopyProgressState,
) -> Result<(), String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
    C: Fn(&Path, &Path) -> std::io::Result<()>,
{
    match top_level_entry {
        ExtractedTopLevel::Directory(path) => {
            copy_directory_contents(path, destination_path, emit_progress, copy_file, progress)
        }
        ExtractedTopLevel::File(path) => {
            let file_name = path
                .file_name()
                .ok_or_else(|| format!("Extracted file is missing a name: {}", path.display()))?;
            let destination_file = destination_path.join(file_name);
            copy_file(path, &destination_file).map_err(|error| {
                format!(
                    "Failed to copy {} to {}: {}",
                    path.display(),
                    destination_file.display(),
                    error
                )
            })?;
            progress.copied_files += 1;
            emit_progress(copy_archive_progress_payload(
                progress.copied_files,
                progress.total_files,
            ))?;
            Ok(())
        }
    }
}

fn copy_directory_contents<F, C>(
    source_path: &Path,
    destination_path: &Path,
    emit_progress: &mut F,
    copy_file: &C,
    progress: &mut CopyProgressState,
) -> Result<(), String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
    C: Fn(&Path, &Path) -> std::io::Result<()>,
{
    let read_dir = fs::read_dir(source_path).map_err(|error| {
        format!(
            "Failed to read directory {}: {}",
            source_path.display(),
            error
        )
    })?;

    for entry_result in read_dir {
        let entry = entry_result.map_err(|error| error.to_string())?;
        let file_name = entry.file_name();
        if file_name.to_string_lossy() == ".git" {
            continue;
        }

        let source_entry_path = entry.path();
        let destination_entry_path = destination_path.join(&file_name);
        let metadata = entry.metadata().map_err(|error| {
            format!(
                "Failed to inspect source entry {}: {}",
                source_entry_path.display(),
                error
            )
        })?;

        if metadata.is_dir() {
            fs::create_dir_all(&destination_entry_path).map_err(|error| {
                format!(
                    "Failed to create destination directory {}: {}",
                    destination_entry_path.display(),
                    error
                )
            })?;
            copy_directory_contents(
                &source_entry_path,
                &destination_entry_path,
                emit_progress,
                copy_file,
                progress,
            )?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        copy_file(&source_entry_path, &destination_entry_path).map_err(|error| {
            format!(
                "Failed to copy {} to {}: {}",
                source_entry_path.display(),
                destination_entry_path.display(),
                error
            )
        })?;
        progress.copied_files += 1;

        if progress.copied_files == progress.total_files
            || progress.copied_files % COPY_PROGRESS_EMIT_INTERVAL == 0
        {
            emit_progress(copy_progress_payload(
                progress.copied_files,
                progress.total_files,
            ))?;
        }
    }

    Ok(())
}

struct ExtractionResult {
    top_level_entry: ExtractedTopLevel,
    top_level_name: String,
    extracted_file_count: usize,
}

fn extract_zip_to_temp<F>(
    archive_path: &Path,
    temp_extraction_dir: &Path,
    emit_progress: &mut F,
) -> Result<ExtractionResult, String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
{
    let file = fs::File::open(archive_path).map_err(|error| {
        format!(
            "Failed to open archive {}: {}",
            archive_path.display(),
            error
        )
    })?;
    let mut archive = ZipArchive::new(BufReader::new(file)).map_err(|error| {
        format!(
            "Failed to read zip archive {}: {}",
            archive_path.display(),
            error
        )
    })?;

    let total_entries = count_extractable_entries(&mut archive)?;
    emit_progress(extract_progress_payload(0, total_entries))?;

    let mut extracted_entries = 0usize;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| {
            format!(
                "Failed to inspect archive entry {index} in {}: {}",
                archive_path.display(),
                error
            )
        })?;
        let entry_name = file.name().to_string();
        if should_skip_archive_entry(entry_name.as_str()) {
            continue;
        }

        let target_path = safe_join_archive_path(temp_extraction_dir, entry_name.as_str())?;
        if file.is_dir() {
            fs::create_dir_all(&target_path).map_err(|error| {
                format!(
                    "Failed to create extracted directory {}: {}",
                    target_path.display(),
                    error
                )
            })?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "Failed to create parent directory {}: {}",
                        parent.display(),
                        error
                    )
                })?;
            }
            let mut output = fs::File::create(&target_path).map_err(|error| {
                format!(
                    "Failed to create extracted file {}: {}",
                    target_path.display(),
                    error
                )
            })?;
            std::io::copy(&mut file, &mut output).map_err(|error| {
                format!(
                    "Failed to extract archive entry {} to {}: {}",
                    entry_name,
                    target_path.display(),
                    error
                )
            })?;
        }

        extracted_entries += 1;
        if extracted_entries == total_entries
            || extracted_entries % COPY_PROGRESS_EMIT_INTERVAL == 0
        {
            emit_progress(extract_progress_payload(extracted_entries, total_entries))?;
        }
    }

    let top_level_entries = list_top_level_entries(temp_extraction_dir)?;
    if top_level_entries.is_empty() {
        return Err("No content extracted from zip.".to_string());
    }
    let selected_top_level = select_top_level_entry(&top_level_entries)?;
    let extracted_file_count = count_files_in_top_level(&selected_top_level)?;
    let top_level_name = top_level_name(&selected_top_level)?;

    Ok(ExtractionResult {
        top_level_entry: selected_top_level,
        top_level_name,
        extracted_file_count,
    })
}

fn count_extractable_entries<R>(archive: &mut ZipArchive<R>) -> Result<usize, String>
where
    R: Read + Seek,
{
    let mut total = 0usize;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Failed to inspect archive entry {index}: {}", error))?;
        if should_skip_archive_entry(file.name()) {
            continue;
        }
        total += 1;
    }
    Ok(total)
}

fn should_skip_archive_entry(entry_name: &str) -> bool {
    let normalized = entry_name.replace('\\', "/");
    let parts = normalized.split('/').filter(|part| !part.is_empty());
    if parts.clone().any(|part| part == ".git") {
        return true;
    }
    normalized.trim_matches('/').is_empty()
}

fn safe_join_archive_path(base: &Path, entry_name: &str) -> Result<PathBuf, String> {
    let mut output = base.to_path_buf();
    for segment in entry_name.replace('\\', "/").split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err(format!("Archive entry escapes destination: {entry_name}"));
        }
        output.push(segment);
    }
    Ok(output)
}

fn list_top_level_entries(path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(path).map_err(|error| {
        format!(
            "Failed to read extracted directory {}: {}",
            path.display(),
            error
        )
    })?;
    for entry_result in read_dir {
        let entry = entry_result.map_err(|error| error.to_string())?;
        entries.push(entry.path());
    }
    Ok(entries)
}

fn select_top_level_entry(entries: &[PathBuf]) -> Result<ExtractedTopLevel, String> {
    if entries.len() == 1 {
        return classify_top_level_entry(entries[0].clone());
    }

    for entry in entries {
        if entry.is_dir()
            && (entry.join("metadata.json").exists() || entry.join("manifest.yaml").exists())
        {
            return classify_top_level_entry(entry.clone());
        }
    }

    classify_top_level_entry(entries[0].clone())
}

fn classify_top_level_entry(path: PathBuf) -> Result<ExtractedTopLevel, String> {
    let metadata = fs::metadata(&path).map_err(|error| {
        format!(
            "Failed to inspect extracted path {}: {}",
            path.display(),
            error
        )
    })?;
    if metadata.is_dir() {
        Ok(ExtractedTopLevel::Directory(path))
    } else if metadata.is_file() {
        Ok(ExtractedTopLevel::File(path))
    } else {
        Err(format!(
            "Extracted top-level entry is neither a file nor directory: {}",
            path.display()
        ))
    }
}

fn top_level_name(entry: &ExtractedTopLevel) -> Result<String, String> {
    let path = match entry {
        ExtractedTopLevel::Directory(path) | ExtractedTopLevel::File(path) => path,
    };
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .ok_or_else(|| {
            format!(
                "Extracted top-level entry is missing a name: {}",
                path.display()
            )
        })
}

fn extract_progress_payload(current: usize, total: usize) -> ImportProgressPayload {
    ImportProgressPayload {
        phase: "extract-archive".to_string(),
        message: format!("Extracting archive contents ({current}/{total})..."),
        current: Some(current),
        total: Some(total),
    }
}

fn copy_progress_payload(current: usize, total: usize) -> ImportProgressPayload {
    copy_progress_payload_with_message(current, total, "Copying source directory into app storage")
}

fn copy_archive_progress_payload(current: usize, total: usize) -> ImportProgressPayload {
    copy_progress_payload_with_message(current, total, "Copying extracted archive into app storage")
}

fn copy_progress_payload_with_message(
    current: usize,
    total: usize,
    prefix: &str,
) -> ImportProgressPayload {
    ImportProgressPayload {
        phase: "copy-content".to_string(),
        message: format!("{prefix} ({current}/{total})..."),
        current: Some(current),
        total: Some(total),
    }
}

fn failed_payload(message: &str) -> ImportProgressPayload {
    ImportProgressPayload {
        phase: "failed".to_string(),
        message: message.to_string(),
        current: None,
        total: None,
    }
}

fn read_source_payload(url: &str, current: usize, total: Option<usize>) -> ImportProgressPayload {
    ImportProgressPayload {
        phase: "read-source".to_string(),
        message: format!("Downloading remote archive {url}..."),
        current: Some(current),
        total,
    }
}

fn remove_partial_destination(destination: &Path) -> Result<(), String> {
    if destination.exists() {
        fs::remove_dir_all(destination).map_err(|error| {
            format!(
                "Failed to clean up partial destination {}: {}",
                destination.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Failed to remove file {}: {}", path.display(), error))?;
    }

    Ok(())
}

type PackedChapterMap = BTreeMap<String, BTreeMap<String, String>>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackedBookPayload {
    book_code: String,
    chapters: PackedChapterMap,
}

struct CollectedNotes {
    books: BTreeMap<String, PackedChapterMap>,
    support_files: Vec<PathBuf>,
    note_count: usize,
    has_scripture_like_files: bool,
}

fn finalize_imported_resource_in_place<F>(
    resource_path: &Path,
    emit_progress: &mut F,
) -> Result<(), String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
{
    if !resource_path.is_dir() {
        return Ok(());
    }

    let collected = collect_translation_notes(resource_path, emit_progress)?;
    if !should_pack_translation_notes(resource_path, &collected)? {
        return Ok(());
    }

    let resource_name = resource_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| {
            format!(
                "Imported resource path has no usable name: {}",
                resource_path.display()
            )
        })?;
    let parent = resource_path.parent().ok_or_else(|| {
        format!(
            "Imported resource path has no parent: {}",
            resource_path.display()
        )
    })?;
    let packed_temp = parent.join(format!("{resource_name}.packed-{}", unique_nonce()));
    let raw_backup = parent.join(format!("{resource_name}.raw-{}", unique_nonce()));

    fs::create_dir_all(&packed_temp).map_err(|error| {
        format!(
            "Failed to create temporary packed TN directory {}: {}",
            packed_temp.display(),
            error
        )
    })?;

    let result = (|| -> Result<(), String> {
        emit_progress(ImportProgressPayload {
            phase: "reshape-resource".to_string(),
            message: format!(
                "Packing translation notes into per-book JSON (0/{})...",
                collected.books.len()
            ),
            current: Some(0),
            total: Some(collected.books.len()),
        })?;

        for support_file in &collected.support_files {
            let output_name = support_file
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| format!("Support file missing name: {}", support_file.display()))?;
            fs::copy(support_file, packed_temp.join(output_name)).map_err(|error| {
                format!(
                    "Failed to copy support file {} into packed TN root: {}",
                    support_file.display(),
                    error
                )
            })?;
        }

        let total_books = collected.books.len();
        for (index, (book_code, chapters)) in collected.books.iter().enumerate() {
            let payload = PackedBookPayload {
                book_code: book_code.clone(),
                chapters: chapters.clone(),
            };
            let file_path = packed_temp.join(format!("{}.json", book_code.to_lowercase()));
            let contents = serde_json::to_string_pretty(&payload).map_err(|error| {
                format!("Failed to serialize packed TN book {book_code}: {error}")
            })?;
            fs::write(&file_path, contents).map_err(|error| {
                format!(
                    "Failed to write packed TN book {}: {}",
                    file_path.display(),
                    error
                )
            })?;

            let current = index + 1;
            emit_progress(ImportProgressPayload {
                phase: "reshape-resource".to_string(),
                message: format!(
                    "Packing translation notes into per-book JSON ({current}/{total_books})..."
                ),
                current: Some(current),
                total: Some(total_books),
            })?;
        }

        fs::rename(resource_path, &raw_backup).map_err(|error| {
            format!(
                "Failed to move raw TN resource {} aside: {}",
                resource_path.display(),
                error
            )
        })?;
        if let Err(error) = fs::rename(&packed_temp, resource_path) {
            let _ = fs::rename(&raw_backup, resource_path);
            return Err(format!(
                "Failed to replace raw TN resource with packed output: {}",
                error
            ));
        }

        remove_partial_destination(&raw_backup)
    })();

    if result.is_err() {
        let _ = remove_partial_destination(&packed_temp);
    }

    result
}

fn should_pack_translation_notes(
    resource_path: &Path,
    collected: &CollectedNotes,
) -> Result<bool, String> {
    if collected.note_count == 0 || collected.has_scripture_like_files {
        return Ok(false);
    }

    let manifest_path = resource_path.join("manifest.yaml");
    if manifest_path.exists() {
        let contents = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("Failed to read {}: {}", manifest_path.display(), error))?;
        if looks_like_translation_notes(contents.as_str()) {
            return Ok(true);
        }
    }

    let metadata_path = resource_path.join("metadata.json");
    if metadata_path.exists() {
        let contents = fs::read_to_string(&metadata_path)
            .map_err(|error| format!("Failed to read {}: {}", metadata_path.display(), error))?;
        if looks_like_translation_notes(contents.as_str()) {
            return Ok(true);
        }
    }

    Ok(collected.note_count > 0)
}

fn looks_like_translation_notes(contents: &str) -> bool {
    let lower = contents.to_lowercase();
    lower.contains("translation notes")
        || lower.contains("_tn")
        || lower.contains(" tn")
        || lower.contains("tn_")
}

fn collect_translation_notes<F>(
    resource_path: &Path,
    emit_progress: &mut F,
) -> Result<CollectedNotes, String>
where
    F: FnMut(ImportProgressPayload) -> Result<(), String>,
{
    let mut books: BTreeMap<String, PackedChapterMap> = BTreeMap::new();
    let mut support_files = Vec::new();
    let mut note_count = 0usize;
    let mut has_scripture_like_files = false;

    fn walk<F2>(
        root: &Path,
        current: &Path,
        books: &mut BTreeMap<String, PackedChapterMap>,
        support_files: &mut Vec<PathBuf>,
        note_count: &mut usize,
        has_scripture_like_files: &mut bool,
        emit_progress: &mut F2,
    ) -> Result<(), String>
    where
        F2: FnMut(ImportProgressPayload) -> Result<(), String>,
    {
        let read_dir = fs::read_dir(current).map_err(|error| {
            format!("Failed to read directory {}: {}", current.display(), error)
        })?;

        for entry_result in read_dir {
            let entry = entry_result.map_err(|error| error.to_string())?;
            let path = entry.path();
            let file_name = entry.file_name();
            if file_name.to_string_lossy() == ".git" {
                continue;
            }

            let metadata = entry
                .metadata()
                .map_err(|error| format!("Failed to inspect {}: {}", path.display(), error))?;
            if metadata.is_dir() {
                walk(
                    root,
                    &path,
                    books,
                    support_files,
                    note_count,
                    has_scripture_like_files,
                    emit_progress,
                )?;
                continue;
            }
            if !metadata.is_file() {
                continue;
            }

            let relative = path
                .strip_prefix(root)
                .map_err(|error| format!("Failed to compute relative path: {}", error))?;
            let relative_str = relative.to_string_lossy().replace('\\', "/");
            if relative_str.ends_with(".usfm")
                || relative_str.ends_with(".usx")
                || relative_str.ends_with(".txt")
            {
                *has_scripture_like_files = true;
            }

            if file_name.to_string_lossy() == "translation-notes.metadata.json" {
                continue;
            }

            if let Some((book_code, chapter, verse)) = parse_tn_note_path(relative_str.as_str()) {
                let contents = fs::read_to_string(&path).map_err(|error| {
                    format!("Failed to read TN note {}: {}", path.display(), error)
                })?;
                let chapters = books.entry(book_code.to_string()).or_default();
                let verses = chapters.entry(chapter.to_string()).or_default();
                verses.insert(verse.to_string(), contents);
                *note_count += 1;
                if *note_count == 1 || *note_count % 250 == 0 {
                    emit_progress(ImportProgressPayload {
                        phase: "reshape-resource".to_string(),
                        message: format!(
                            "Scanning translation notes source files ({} notes read)...",
                            *note_count
                        ),
                        current: Some(*note_count),
                        total: None,
                    })?;
                }
            } else {
                support_files.push(path);
            }
        }

        Ok(())
    }

    emit_progress(ImportProgressPayload {
        phase: "reshape-resource".to_string(),
        message: "Scanning translation notes source files...".to_string(),
        current: None,
        total: None,
    })?;

    walk(
        resource_path,
        resource_path,
        &mut books,
        &mut support_files,
        &mut note_count,
        &mut has_scripture_like_files,
        emit_progress,
    )?;

    Ok(CollectedNotes {
        books,
        support_files,
        note_count,
        has_scripture_like_files,
    })
}

fn parse_tn_note_path(relative_path: &str) -> Option<(String, String, String)> {
    let parts = relative_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.len() != 3 {
        return None;
    }

    let book = parts[0].trim().to_uppercase();
    if !is_canonical_book_code(book.as_str()) {
        return None;
    }
    if parts[1].parse::<usize>().ok().is_none() {
        return None;
    }
    let verse = parts[2]
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(parts[2]);
    if verse.parse::<usize>().ok().is_none() {
        return None;
    }

    Some((book, parts[1].to_string(), verse.to_string()))
}

fn is_canonical_book_code(book_code: &str) -> bool {
    matches!(
        book_code,
        "GEN"
            | "EXO"
            | "LEV"
            | "NUM"
            | "DEU"
            | "JOS"
            | "JDG"
            | "RUT"
            | "1SA"
            | "2SA"
            | "1KI"
            | "2KI"
            | "1CH"
            | "2CH"
            | "EZR"
            | "NEH"
            | "EST"
            | "JOB"
            | "PSA"
            | "PRO"
            | "ECC"
            | "SNG"
            | "ISA"
            | "JER"
            | "LAM"
            | "EZK"
            | "DAN"
            | "HOS"
            | "JOL"
            | "AMO"
            | "OBA"
            | "JON"
            | "MIC"
            | "NAM"
            | "HAB"
            | "ZEP"
            | "HAG"
            | "ZEC"
            | "MAL"
            | "MAT"
            | "MRK"
            | "LUK"
            | "JHN"
            | "ACT"
            | "ROM"
            | "1CO"
            | "2CO"
            | "GAL"
            | "EPH"
            | "PHP"
            | "COL"
            | "1TH"
            | "2TH"
            | "1TI"
            | "2TI"
            | "TIT"
            | "PHM"
            | "HEB"
            | "JAS"
            | "1PE"
            | "2PE"
            | "1JN"
            | "2JN"
            | "3JN"
            | "JUD"
            | "REV"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    fn make_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "dovetail-import-{name}-{}-{nonce}",
            std::process::id(),
            nonce = unique_nonce()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent directories");
        }
        fs::write(path, contents).expect("write fixture file");
    }

    #[test]
    fn copies_nested_directories_and_skips_git() {
        let sandbox = make_temp_dir("copy-success");
        let source = sandbox.join("en_tn");
        let projects_root = sandbox.join("managed-projects");
        write_file(&source.join("manifest.yaml"), "projects: []");
        write_file(&source.join("notes/luk/01.md"), "note");
        write_file(&source.join(".git/config"), "ignored");

        let mut progress_events = Vec::<ImportProgressPayload>::new();
        let destination = copy_directory_into_managed_storage(
            &source,
            &projects_root,
            &mut |payload| {
                progress_events.push(payload);
                Ok(())
            },
            &|from, to| fs::copy(from, to).map(|_| ()),
        )
        .expect("copy should succeed");

        assert_eq!(destination, projects_root.join("en_tn"));
        assert!(destination.join("manifest.yaml").exists());
        assert!(destination.join("notes/luk/01.md").exists());
        assert!(!destination.join(".git").exists());
        assert_eq!(progress_events.first(), Some(&copy_progress_payload(0, 2)));
        assert_eq!(progress_events.last(), Some(&copy_progress_payload(2, 2)));

        fs::remove_dir_all(sandbox).ok();
    }

    #[test]
    fn cleans_up_partial_destination_when_copy_fails() {
        let sandbox = make_temp_dir("copy-failure");
        let source = sandbox.join("en_tn");
        let projects_root = sandbox.join("managed-projects");
        write_file(&source.join("manifest.yaml"), "projects: []");
        write_file(&source.join("notes/luk/01.md"), "note");

        let mut progress_events = Vec::<ImportProgressPayload>::new();
        let error = copy_directory_into_managed_storage(
            &source,
            &projects_root,
            &mut |payload| {
                progress_events.push(payload);
                Ok(())
            },
            &|from, to| {
                if from.file_name().and_then(|name| name.to_str()) == Some("01.md") {
                    return Err(io::Error::new(io::ErrorKind::Other, "boom"));
                }
                fs::copy(from, to).map(|_| ())
            },
        )
        .expect_err("copy should fail");

        assert!(error.contains("Failed to copy source directory into app storage"));
        assert!(!projects_root.join("en_tn").exists());
        assert_eq!(progress_events.first(), Some(&copy_progress_payload(0, 2)));
        assert_eq!(
            progress_events.last().map(|payload| payload.phase.as_str()),
            Some("failed")
        );

        fs::remove_dir_all(sandbox).ok();
    }

    fn create_test_zip(path: &Path, entries: &[(&str, Option<&str>)]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create zip parent directory");
        }
        let file = fs::File::create(path).expect("create zip file");
        let mut writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();

        for (name, contents) in entries {
            if let Some(contents) = contents {
                writer.start_file(name, options).expect("start file");
                writer
                    .write_all(contents.as_bytes())
                    .expect("write zip file contents");
            } else {
                writer.add_directory(*name, options).expect("add directory");
            }
        }

        writer.finish().expect("finish zip writer");
    }

    #[test]
    fn extracts_archive_into_managed_storage_with_progress_and_git_skip() {
        let sandbox = make_temp_dir("zip-success");
        let archive_path = sandbox.join("en_tn.zip");
        let projects_root = sandbox.join("managed-projects");
        let temp_root = sandbox.join("temp");
        create_test_zip(
            &archive_path,
            &[
                ("en_tn/manifest.yaml", Some("projects: []")),
                ("en_tn/notes/luk/01.md", Some("note")),
                ("en_tn/.git/config", Some("ignored")),
            ],
        );

        let mut progress_events = Vec::<ImportProgressPayload>::new();
        let destination = extract_zip_into_managed_storage(
            &archive_path,
            &projects_root,
            &temp_root,
            &mut |payload| {
                progress_events.push(payload);
                Ok(())
            },
            &|from, to| fs::copy(from, to).map(|_| ()),
        )
        .expect("zip import should succeed");

        assert_eq!(destination, projects_root.join("en_tn"));
        assert!(destination.join("manifest.yaml").exists());
        assert!(destination.join("notes/luk/01.md").exists());
        assert!(!destination.join(".git").exists());
        assert_eq!(
            progress_events.first(),
            Some(&extract_progress_payload(0, 2))
        );
        assert!(progress_events
            .iter()
            .any(|payload| payload.phase == "copy-content"
                && payload
                    .message
                    .starts_with("Copying extracted archive into app storage")));
        assert!(fs::read_dir(&temp_root)
            .expect("read temp root")
            .next()
            .is_none());

        fs::remove_dir_all(sandbox).ok();
    }

    #[test]
    fn cleans_up_partial_destination_when_archive_copy_fails() {
        let sandbox = make_temp_dir("zip-failure");
        let archive_path = sandbox.join("en_tn.zip");
        let projects_root = sandbox.join("managed-projects");
        let temp_root = sandbox.join("temp");
        create_test_zip(
            &archive_path,
            &[
                ("en_tn/manifest.yaml", Some("projects: []")),
                ("en_tn/notes/luk/01.md", Some("note")),
            ],
        );

        let mut progress_events = Vec::<ImportProgressPayload>::new();
        let error = extract_zip_into_managed_storage(
            &archive_path,
            &projects_root,
            &temp_root,
            &mut |payload| {
                progress_events.push(payload);
                Ok(())
            },
            &|from, to| {
                if from.file_name().and_then(|name| name.to_str()) == Some("01.md") {
                    return Err(std::io::Error::other("boom"));
                }
                fs::copy(from, to).map(|_| ())
            },
        )
        .expect_err("zip import should fail");

        assert!(error.contains("Failed to extract archive into app storage"));
        assert!(!projects_root.join("en_tn").exists());
        assert!(fs::read_dir(&temp_root)
            .expect("read temp root")
            .next()
            .is_none());
        assert_eq!(
            progress_events.first(),
            Some(&extract_progress_payload(0, 2))
        );
        assert_eq!(
            progress_events.last().map(|payload| payload.phase.as_str()),
            Some("failed")
        );

        fs::remove_dir_all(sandbox).ok();
    }

    #[test]
    fn downloads_remote_archive_then_materializes_it_through_native_zip_flow() {
        let sandbox = make_temp_dir("remote-success");
        let projects_root = sandbox.join("managed-projects");
        let temp_root = sandbox.join("temp");
        let url = "https://example.org/en_tn.zip";
        let mut progress_events = Vec::<ImportProgressPayload>::new();

        let destination = download_remote_archive_into_managed_storage(
            url,
            &projects_root,
            &temp_root,
            &mut |payload| {
                progress_events.push(payload);
                Ok(())
            },
            &|requested_url, temp_root, emit_progress| {
                assert_eq!(requested_url, url);
                emit_progress(read_source_payload(requested_url, 0, Some(32)))?;
                let downloaded_archive = temp_root.join("en_tn.zip");
                create_test_zip(
                    &downloaded_archive,
                    &[
                        ("en_tn/manifest.yaml", Some("projects: []")),
                        ("en_tn/notes/luk/01.md", Some("note")),
                    ],
                );
                Ok(downloaded_archive)
            },
            &|from, to| fs::copy(from, to).map(|_| ()),
        )
        .expect("remote import should succeed");

        assert_eq!(destination, projects_root.join("en_tn"));
        assert!(destination.join("manifest.yaml").exists());
        assert!(destination.join("notes/luk/01.md").exists());
        assert!(fs::read_dir(&temp_root)
            .expect("read temp root")
            .next()
            .is_none());
        assert_eq!(
            progress_events.first(),
            Some(&read_source_payload(url, 0, Some(32)))
        );
        assert!(progress_events
            .iter()
            .any(|payload| payload.phase == "extract-archive"));
        assert!(progress_events
            .iter()
            .any(|payload| payload.phase == "copy-content"));

        fs::remove_dir_all(sandbox).ok();
    }
}
