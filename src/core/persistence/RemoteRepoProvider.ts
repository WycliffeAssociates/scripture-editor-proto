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
};

export type CreateRemoteRepoRequest = {
    name: string;
    visibility: RemoteRepoVisibility;
    topics: string[];
    defaultBranch: string;
};

export interface RemoteRepoProvider {
    listWritableRepos(args: {
        hostBaseUrl: string;
        username: string;
        token: string;
        page: number;
        pageSize: number;
        topic?: string;
    }): Promise<RemoteRepoPage>;
    createRepo(args: {
        hostBaseUrl: string;
        username: string;
        token: string;
        request: CreateRemoteRepoRequest;
    }): Promise<RemoteRepoSummary>;
}
