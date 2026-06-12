export type RemoteRepoVisibility = "public" | "private";
export const REMOTE_REPO_CREATED_DEFAULT_BRANCH = "master" as const;

export type RemoteRepoSummary = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  topics: string[];
  canWrite: boolean;
};

export type RemoteRepoPage = {
  repos: RemoteRepoSummary[];
  nextPage: number | null;
  rawResultCount: number;
};

export type CreateRemoteRepoRequest = {
  name: string;
  visibility: RemoteRepoVisibility;
  topics: string[];
  defaultBranch: string;
};

export type RemoteRepoProjectMetadata =
  | {
      format: "scripture-burrito";
      metadataPath: "metadata.json";
      languageTag: string | null;
      isScriptureTextTranslation: boolean;
    }
  | {
      format: "resource-container";
      metadataPath: "manifest.yaml";
      languageTag: string | null;
      isScriptureTextTranslation: boolean;
    };

export interface RemoteRepoProvider {
  listWritableRepos(args: {
    hostBaseUrl: string;
    username: string;
    token: string;
    page: number;
    pageSize: number;
    topic?: string;
    searchQuery?: string;
    signal?: AbortSignal;
  }): Promise<RemoteRepoPage>;
  listOwnedRepos(args: {
    hostBaseUrl: string;
    username: string;
    token: string;
    page: number;
    pageSize: number;
    topic?: string;
    searchQuery?: string;
    signal?: AbortSignal;
  }): Promise<RemoteRepoPage>;
  createRepo(args: {
    hostBaseUrl: string;
    username: string;
    token: string;
    request: CreateRemoteRepoRequest;
  }): Promise<RemoteRepoSummary>;
  /**
   * Resolve a single repo to its full summary — the catalog (consolidated
   * view) only carries owner/name, so this bridges a catalog selection to the
   * attachable shape (`cloneUrl`, `defaultBranch`) and reports `canWrite`.
   * Returns null when the repo doesn't exist or isn't visible to the caller.
   */
  getRepo(args: {
    hostBaseUrl: string;
    username: string;
    token: string;
    owner: string;
    name: string;
    signal?: AbortSignal;
  }): Promise<RemoteRepoSummary | null>;
  /**
   * Fork `owner/name` into the authenticated user's account and ensure the
   * given topics are present on the fork. Forking (rather than creating an
   * empty repo) preserves provenance and the shared git base, so a derived
   * local project can attach to the fork and sync cleanly. Returns the fork's
   * summary (owned by the caller, so `canWrite`). Resolves the existing fork
   * if the caller already forked this repo.
   */
  forkRepo(args: {
    hostBaseUrl: string;
    username: string;
    token: string;
    owner: string;
    name: string;
    topics: string[];
    signal?: AbortSignal;
  }): Promise<RemoteRepoSummary>;
  inspectProjectMetadata(args: {
    hostBaseUrl: string;
    token: string;
    repoOwner: string;
    repoName: string;
    ref?: string;
  }): Promise<RemoteRepoProjectMetadata | null>;
}
