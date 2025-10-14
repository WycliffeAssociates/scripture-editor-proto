// import {invoke} from "@tauri-apps/api/tauri";

import { invoke } from "@tauri-apps/api/core";
import type { IGitProvider } from "@/core/persistence/git/GitProvider";
import type { TauriDirectoryProvider } from "@/tauri/persistence/TauriDirectoryProvider.ts";

export class TauriGitProvider implements IGitProvider {
    private directoryProvider: TauriDirectoryProvider;

    constructor(directoryProvider: TauriDirectoryProvider) {
        this.directoryProvider = directoryProvider;
    }

    async cloneRepository(url: string): Promise<undefined | Error> {
        const basePath = await this.directoryProvider.getUserDataDirectory();
        const args = {
            url,
            path: basePath.path,
        };
        return invoke("clone_repo", args);
    }
}
