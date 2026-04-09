use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use git2::{
    build::CheckoutBuilder, BranchType, Cred, ErrorCode, FetchOptions, IndexAddOption,
    ObjectType, Oid, PushOptions, RemoteCallbacks, Repository, RepositoryInitOptions, Signature,
    Sort, Tree,
};
use serde::Deserialize;
use serde::Serialize;

fn branch_exists(repo: &Repository, branch_name: &str) -> bool {
    repo.find_branch(branch_name, BranchType::Local).is_ok()
}

fn detect_default_branch(repo: &Repository, current: &str) -> Option<String> {
    if branch_exists(repo, "main") {
        return Some("main".to_string());
    }
    if branch_exists(repo, "master") {
        return Some("master".to_string());
    }
    if !current.is_empty() && branch_exists(repo, current) {
        return Some(current.to_string());
    }
    None
}

fn resolve_commit_oid(repo: &Repository, commit_hash: &str) -> Result<Oid, String> {
    let obj = repo
        .revparse_single(commit_hash)
        .map_err(|e| e.message().to_string())?;
    obj.peel_to_commit()
        .map(|commit| commit.id())
        .map_err(|e| e.message().to_string())
}

fn collect_tree_text_files(
    repo: &Repository,
    tree: &Tree<'_>,
    prefix: &str,
    out: &mut HashMap<String, String>,
) -> Result<(), String> {
    for entry in tree {
        let Some(name) = entry.name() else {
            continue;
        };
        let rel_path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };

        match entry.kind() {
            Some(ObjectType::Blob) => {
                let blob = repo
                    .find_blob(entry.id())
                    .map_err(|e| e.message().to_string())?;
                let text = String::from_utf8_lossy(blob.content()).to_string();
                out.insert(rel_path, text);
            }
            Some(ObjectType::Tree) => {
                let subtree = repo
                    .find_tree(entry.id())
                    .map_err(|e| e.message().to_string())?;
                collect_tree_text_files(repo, &subtree, &rel_path, out)?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn collect_tree_paths(
    repo: &Repository,
    tree: &Tree<'_>,
    prefix: &str,
    out: &mut HashSet<String>,
) -> Result<(), String> {
    for entry in tree {
        let Some(name) = entry.name() else {
            continue;
        };
        let rel_path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        match entry.kind() {
            Some(ObjectType::Blob) => {
                out.insert(rel_path);
            }
            Some(ObjectType::Tree) => {
                let subtree = repo
                    .find_tree(entry.id())
                    .map_err(|e| e.message().to_string())?;
                collect_tree_paths(repo, &subtree, &rel_path, out)?;
            }
            _ => {}
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub struct GitBranchInfo {
    pub current: String,
    pub has_master: bool,
    pub default_branch: Option<String>,
    pub detached: bool,
}

#[derive(Serialize)]
pub struct GitHistoryEntry {
    pub hash: String,
    pub author_name: String,
    pub authored_at_unix: i64,
    pub subject: String,
    pub body: String,
}

#[derive(Serialize, Deserialize)]
pub struct GitRemoteRelationship {
    pub kind: String,
    pub local_head: Option<String>,
    pub remote_head: Option<String>,
    pub merge_base: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct GitRemoteInspection {
    pub local_head: Option<String>,
    pub remote_head: Option<String>,
    pub merge_base: Option<String>,
    pub relationship: GitRemoteRelationship,
}

#[derive(Serialize, Deserialize)]
pub struct GitRemoteReplayPlan {
    pub strategy: String,
    pub commit_hashes: Vec<String>,
    pub relationship: GitRemoteRelationship,
}

#[derive(Serialize, Deserialize)]
pub struct GitRemoteReplayResult {
    pub head: Option<String>,
    pub replayed_commit_hashes: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct GitRemotePublishResult {
    pub outcome: String,
    pub local_head: Option<String>,
    pub remote_head: Option<String>,
}

fn classify_remote_relationship(
    local_head: Option<String>,
    remote_head: Option<String>,
    merge_base: Option<String>,
) -> GitRemoteRelationship {
    let kind = if remote_head.is_none() {
        "untrackedRemote"
    } else if local_head == remote_head {
        "upToDate"
    } else if local_head.is_none() || merge_base.is_none() {
        "diverged"
    } else if merge_base == local_head {
        "behindOnly"
    } else if merge_base == remote_head {
        "aheadOnly"
    } else {
        "diverged"
    };

    GitRemoteRelationship {
        kind: kind.to_string(),
        local_head,
        remote_head,
        merge_base,
    }
}

fn try_resolve_reference_target(repo: &Repository, reference: &str) -> Result<Option<Oid>, String> {
    match repo.find_reference(reference) {
        Ok(reference) => Ok(reference.target()),
        Err(error) => {
            if error.code() == ErrorCode::NotFound {
                Ok(None)
            } else {
                Err(error.message().to_string())
            }
        }
    }
}

fn reset_branch_to_commit(repo: &Repository, branch: &str, target: Oid) -> Result<(), String> {
    let ref_name = format!("refs/heads/{branch}");
    repo.reference(&ref_name, target, true, "dovetail remote replay")
        .map_err(|e| e.message().to_string())?;
    repo.set_head(&ref_name)
        .map_err(|e| e.message().to_string())?;
    repo.checkout_head(Some(CheckoutBuilder::new().force()))
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

fn remote_callbacks_for_token(username: &str, token: &str) -> RemoteCallbacks<'static> {
    let username = username.to_string();
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
        Cred::userpass_plaintext(&username, &token)
    });
    callbacks
}

fn classify_remote_transport_failure(message: &str) -> Option<&'static str> {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("non-fast-forward")
        || normalized.contains("fetch first")
        || normalized.contains("failed to push some refs")
        || normalized.contains("push rejected")
    {
        return Some("remoteAdvanced");
    }
    if normalized.contains("401")
        || normalized.contains("403")
        || normalized.contains("authentication")
        || normalized.contains("authorization")
        || normalized.contains("forbidden")
        || normalized.contains("access denied")
    {
        return Some("authFailed");
    }
    if normalized.contains("offline")
        || normalized.contains("network")
        || normalized.contains("timed out")
        || normalized.contains("could not resolve host")
        || normalized.contains("connection")
        || normalized.contains("dns")
    {
        return Some("offline");
    }
    None
}

#[tauri::command]
pub fn git_clone_remote_repo(
    repo_path: String,
    remote_url: String,
    branch: Option<String>,
    username: String,
    token: String,
) -> Result<Option<String>, String> {
    let repo_path_buf = PathBuf::from(&repo_path);
    if let Some(parent) = repo_path_buf.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let callbacks = remote_callbacks_for_token(&username, &token);
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options);
    if let Some(branch_name) = branch.as_deref() {
        builder.branch(branch_name);
    }

    let repo = builder
        .clone(&remote_url, &repo_path_buf)
        .map_err(|e| e.message().to_string())?;

    let head = repo.head().ok().and_then(|head| head.target()).map(|oid| oid.to_string());
    Ok(head)
}

#[tauri::command]
pub fn git_ensure_remote(
    repo_path: String,
    remote_name: String,
    remote_url: String,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    match repo.find_remote(&remote_name) {
        Ok(_) => repo
            .remote_set_url(&remote_name, &remote_url)
            .map_err(|e| e.message().to_string())?,
        Err(error) => {
            if error.code() != ErrorCode::NotFound {
                return Err(error.message().to_string());
            }
            repo.remote(&remote_name, &remote_url)
                .map_err(|e| e.message().to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn git_ensure_repo(repo_path: String, default_branch: String) -> Result<(), String> {
    if Repository::open(&repo_path).is_ok() {
        return Ok(());
    }

    fs::create_dir_all(&repo_path).map_err(|e| e.to_string())?;
    let mut init_options = RepositoryInitOptions::new();
    init_options.initial_head(default_branch.as_str());

    Repository::init_opts(&repo_path, &init_options).map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn git_get_branch_info(repo_path: String) -> Result<GitBranchInfo, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let detached = repo.head_detached().map_err(|e| e.message().to_string())?;
    let current = if detached {
        String::new()
    } else {
        repo.head()
            .ok()
            .and_then(|head| head.shorthand().map(|s| s.to_string()))
            .unwrap_or_default()
    };

    let has_master = branch_exists(&repo, "master");
    let default_branch = detect_default_branch(&repo, &current);

    Ok(GitBranchInfo {
        current,
        has_master,
        default_branch,
        detached,
    })
}

#[tauri::command]
pub fn git_checkout_preferred_branch(repo_path: String, prefer: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head_state = repo.head();
    let current = head_state
        .as_ref()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()))
        .unwrap_or_default();
    let is_unborn = match &head_state {
        Ok(head) => head.target().is_none(),
        Err(error) => error.code() == ErrorCode::UnbornBranch,
    };

    if is_unborn {
        let target = if prefer.is_empty() {
            "main".to_string()
        } else {
            prefer
        };
        let ref_name = format!("refs/heads/{target}");
        repo.reference_symbolic("HEAD", ref_name.as_str(), true, "set unborn HEAD")
            .map_err(|e| e.message().to_string())?;
        return Ok(());
    }

    let target = if branch_exists(&repo, &prefer) {
        prefer
    } else {
        detect_default_branch(&repo, &current)
            .ok_or_else(|| "No suitable branch available for checkout".to_string())?
    };

    let ref_name = format!("refs/heads/{target}");
    repo.set_head(ref_name.as_str())
        .map_err(|e| e.message().to_string())?;
    repo.checkout_head(Some(CheckoutBuilder::new().force()))
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn git_list_history(
    repo_path: String,
    limit: usize,
    offset: usize,
) -> Result<Vec<GitHistoryEntry>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    if revwalk.push_head().is_err() {
        return Ok(Vec::new());
    }
    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let mut out = Vec::<GitHistoryEntry>::new();
    for oid_result in revwalk.skip(offset).take(limit) {
        let oid = oid_result.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        out.push(GitHistoryEntry {
            hash: oid.to_string(),
            author_name: commit.author().name().unwrap_or("Unknown").to_string(),
            authored_at_unix: commit.time().seconds(),
            subject: commit.summary().unwrap_or("").to_string(),
            body: commit.body().unwrap_or("").to_string(),
        });
    }

    Ok(out)
}

#[tauri::command]
pub fn git_read_commit_details(
    repo_path: String,
    commit_hash: String,
) -> Result<GitHistoryEntry, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let commit_oid = resolve_commit_oid(&repo, &commit_hash)?;
    let commit = repo
        .find_commit(commit_oid)
        .map_err(|e| e.message().to_string())?;

    let hash = commit.id().to_string();
    let author_name = commit.author().name().unwrap_or("Unknown").to_string();
    let authored_at_unix = commit.time().seconds();
    let subject = commit.summary().unwrap_or("").to_string();
    let body = commit.body().unwrap_or("").to_string();

    Ok(GitHistoryEntry {
        hash,
        author_name,
        authored_at_unix,
        subject,
        body,
    })
}

#[tauri::command]
pub fn git_read_project_snapshot_at_commit(
    repo_path: String,
    commit_hash: String,
) -> Result<HashMap<String, String>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let commit_oid = resolve_commit_oid(&repo, &commit_hash)?;
    let commit = repo
        .find_commit(commit_oid)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;

    let mut snapshot = HashMap::<String, String>::new();
    collect_tree_text_files(&repo, &tree, "", &mut snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn git_restore_tracked_files_from_commit(
    repo_path: String,
    commit_hash: String,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let commit_oid = resolve_commit_oid(&repo, &commit_hash)?;
    let commit = repo
        .find_commit(commit_oid)
        .map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;

    let mut target_files = HashMap::<String, String>::new();
    collect_tree_text_files(&repo, &tree, "", &mut target_files)?;

    let mut current_files = HashSet::<String>::new();
    if let Ok(head) = repo.head() {
        if let Ok(head_commit) = head.peel_to_commit() {
            if let Ok(head_tree) = head_commit.tree() {
                collect_tree_paths(&repo, &head_tree, "", &mut current_files)?;
            }
        }
    }

    for current_file in current_files {
        if target_files.contains_key(&current_file) {
            continue;
        }
        let full_path = Path::new(&repo_path).join(&current_file);
        if full_path.exists() {
            fs::remove_file(full_path).map_err(|e| e.to_string())?;
        }
    }

    for (rel_path, content) in target_files {
        let full_path = Path::new(&repo_path).join(&rel_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(full_path, content.as_bytes()).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn git_commit_all(
    repo_path: String,
    message: String,
    author_name: String,
    author_email: String,
) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| e.message().to_string())?;
    index
        .update_all(["*"].iter(), None)
        .map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())?;

    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;

    let parent = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok());

    if let Some(ref parent_commit) = parent {
        if parent_commit.tree_id() == tree_oid {
            return Ok(parent_commit.id().to_string());
        }
    }

    let signature = Signature::now(author_name.as_str(), author_email.as_str())
        .map_err(|e| e.message().to_string())?;

    let oid = if let Some(ref parent_commit) = parent {
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message.as_str(),
            &tree,
            &[parent_commit],
        )
        .map_err(|e| e.message().to_string())?
    } else {
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message.as_str(),
            &tree,
            &[],
        )
        .map_err(|e| e.message().to_string())?
    };

    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_inspect_remote_heads(
    repo_path: String,
    remote_name: String,
    branch: String,
) -> Result<GitRemoteInspection, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let local_head = repo.head().ok().and_then(|head| head.target());
    let remote_ref = format!("refs/remotes/{}/{}", remote_name, branch);
    let remote_head = try_resolve_reference_target(&repo, &remote_ref)?;
    let merge_base = match (local_head, remote_head) {
        (Some(local), Some(remote)) => repo.merge_base(local, remote).ok(),
        _ => None,
    };
    let relationship = classify_remote_relationship(
        local_head.map(|oid| oid.to_string()),
        remote_head.map(|oid| oid.to_string()),
        merge_base.map(|oid| oid.to_string()),
    );

    Ok(GitRemoteInspection {
        local_head: local_head.map(|oid| oid.to_string()),
        remote_head: remote_head.map(|oid| oid.to_string()),
        merge_base: merge_base.map(|oid| oid.to_string()),
        relationship,
    })
}

#[tauri::command]
pub fn git_fetch_remote_heads(
    repo_path: String,
    remote_name: String,
    branch: String,
    username: String,
    token: String,
) -> Result<GitRemoteInspection, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let refspec = format!("refs/heads/{branch}:refs/remotes/{remote_name}/{branch}");
    let mut remote = repo
        .find_remote(&remote_name)
        .map_err(|e| e.message().to_string())?;
    let callbacks = remote_callbacks_for_token(&username, &token);
    let mut options = FetchOptions::new();
    options.remote_callbacks(callbacks);
    remote
        .fetch(&[refspec.as_str()], Some(&mut options), None)
        .map_err(|e| e.message().to_string())?;
    git_inspect_remote_heads(repo_path, remote_name, branch)
}

#[tauri::command]
pub fn git_push_current_branch(
    repo_path: String,
    remote_name: String,
    branch: String,
    username: String,
    token: String,
) -> Result<GitRemotePublishResult, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let local_head = repo.head().ok().and_then(|head| head.target()).map(|oid| oid.to_string());
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    let mut remote = repo
        .find_remote(&remote_name)
        .map_err(|e| e.message().to_string())?;
    let callbacks = remote_callbacks_for_token(&username, &token);
    let mut options = PushOptions::new();
    options.remote_callbacks(callbacks);

    match remote.push(&[refspec.as_str()], Some(&mut options)) {
        Ok(()) => {
            let inspection = git_inspect_remote_heads(repo_path, remote_name, branch)?;
            Ok(GitRemotePublishResult {
                outcome: "published".to_string(),
                local_head: inspection.local_head,
                remote_head: inspection.remote_head,
            })
        }
        Err(error) => {
            let message = error.message().to_string();
            if let Some(outcome) = classify_remote_transport_failure(&message) {
                Ok(GitRemotePublishResult {
                    outcome: outcome.to_string(),
                    local_head,
                    remote_head: None,
                })
            } else {
                Err(message)
            }
        }
    }
}

#[tauri::command]
pub fn git_plan_replay_onto_remote(
    repo_path: String,
    remote_name: String,
    branch: String,
) -> Result<GitRemoteReplayPlan, String> {
    let inspection = git_inspect_remote_heads(repo_path, remote_name, branch)?;

    Ok(GitRemoteReplayPlan {
        strategy: "none".to_string(),
        commit_hashes: Vec::new(),
        relationship: inspection.relationship,
    })
}

#[tauri::command]
pub fn git_apply_replay_plan_onto_remote(
    repo_path: String,
    branch: String,
    remote_head: String,
    commit_hashes: Vec<String>,
) -> Result<GitRemoteReplayResult, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let remote_oid = Oid::from_str(&remote_head).map_err(|e| e.message().to_string())?;

    if !commit_hashes.is_empty() {
        return Err(
            "Desktop remote reconciliation no longer replays local commits individually; pass an empty commit list and create one final reconciliation commit from the reviewed working state.".to_string(),
        );
    }

    reset_branch_to_commit(&repo, &branch, remote_oid)?;

    let head = repo
        .head()
        .ok()
        .and_then(|reference| reference.target())
        .map(|oid| oid.to_string());

    Ok(GitRemoteReplayResult {
        head,
        replayed_commit_hashes: Vec::new(),
    })
}

#[tauri::command]
pub fn git_is_repo_healthy(repo_path: String) -> Result<bool, String> {
    let repo = match Repository::open(&repo_path) {
        Ok(repo) => repo,
        Err(_) => return Ok(false),
    };

    let _ = repo.index().map_err(|e| e.message().to_string())?;
    Ok(true)
}
