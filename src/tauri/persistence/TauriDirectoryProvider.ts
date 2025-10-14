import {appDataDir, appLocalDataDir, homeDir, join} from "@tauri-apps/api/path";
import {mkdir, open} from "@tauri-apps/plugin-fs";
import {platform} from "@tauri-apps/plugin-os";
import type {
<<<<<<< HEAD:src/tauri/persistence/TauriDirectoryProvider.ts
    IDirectoryProvider,
    ResourceMetadata,
} from "@/core/persistence/DirectoryProvider.ts";
import {TauriFileHandle} from "@/tauri/persistence/handlers/TauriFileHandle.ts";
import {TauriDirectoryHandle} from "@/tauri/persistence/handlers/TauriDirectoryHandle.ts";
=======
  IDirectoryProvider,
  ResourceMetadata,
} from "@/core/data/persistence/DirectoryProvider";
import {
  TauriDirectoryHandle,
  TauriFileHandle,
} from "@/tauri/domain/persistence/tauriHandles";
>>>>>>> baf35fb (merge back Joe's fs work):src/tauri/domain/persistence/tauriDirectoryProvider.ts

export class TauriDirectoryProvider implements IDirectoryProvider {
  private static async getUserHome(osName: string): Promise<string> {
    if (["ios", "android", "macos"].includes(osName)) {
      return await appDataDir();
    } else {
      return await homeDir();
    }
  }

  private constructor(private appName: string, private userHome: string) {}

  static async create(appName: string): Promise<TauriDirectoryProvider> {
    const osName = platform();
    console.log(`Directory Provider for: ${osName}`);
    // biome rule, this in a static context can be misleading. the static context is the class, not the instance
    const userHome = await TauriDirectoryProvider.getUserHome(osName);
    console.log(`User home: ${userHome}`);
    return new TauriDirectoryProvider(appName, userHome);
  }

  async getHomeDirectory(): Promise<TauriDirectoryHandle> {
    console.log(`Home directory: ${this.userHome}`);
    return new TauriDirectoryHandle(this.userHome);
  }

  async getUserDataDirectory(
    appendedPath?: string
  ): Promise<TauriDirectoryHandle> {
    let root = this.userHome;
    const osName = platform();
    if (!["ios", "android"].includes(osName)) {
      root = await join(root, this.appName);
    }

    const path = appendedPath ? await join(root, appendedPath) : root;
    await mkdir(path, {recursive: true});
    console.log(`User data directory: ${path}`);
    return new TauriDirectoryHandle(path);
  }

  async getAppDataDirectory(
    appendedPath?: string
  ): Promise<TauriDirectoryHandle> {
    const path = appendedPath
      ? await join(await appLocalDataDir(), appendedPath)
      : await appLocalDataDir();
    await mkdir(path, {recursive: true});
    console.log(`App data directory: ${path}`);
    return new TauriDirectoryHandle(path);
  }

  async getProjectDirectory(
    source: ResourceMetadata,
    target: ResourceMetadata | null,
    bookSlug: string
  ): Promise<TauriDirectoryHandle> {
    const targetCreator = target?.creator ?? ".";
    const baseDir = await this.getUserDataDirectory();
    const path = await join(
      baseDir.path,
      this.appName,
      targetCreator,
      source.creator,
      `${source.language.slug}_${source.identifier}`,
      `v${target?.version ?? "-none"}`,
      target?.language?.slug ?? "no_language",
      bookSlug
    );
    await mkdir(path, {recursive: true});
    console.log(`Project directory: ${path}`);
    return new TauriDirectoryHandle(path);
  }
  async getDirectoryHandle(
    path: string,
    opts?: {create?: boolean}
  ): Promise<TauriDirectoryHandle> {
    if (opts?.create) await mkdir(path, {recursive: true});
    return new TauriDirectoryHandle(path);
  }

  // ---------------- File utilities ----------------

  async newFileWriter(
    filePath: string
  ): Promise<WritableStreamDefaultWriter<any>> {
    console.log("creating file writer for: " + filePath);
    const file = new TauriFileHandle(filePath);
    const stream = await file.createWritable();
    console.log("file writer created: " + filePath);
    const writer = stream.getWriter();
    console.log("file writer ready: " + filePath);
    return writer;
  }

  async newFileReader(filePath: string): Promise<File> {
    const file = new TauriFileHandle(filePath);
    return file.getFile();
  }

  async createTempFile(
    prefix: string,
    suffix?: string
  ): Promise<TauriFileHandle> {
    const path = await join(
      this.userHome,
      this.appName,
      "temp",
      `${prefix}${suffix ?? ""}`
    );
    await mkdir(await join(this.userHome, this.appName, "temp"), {
      recursive: true,
    });
    return new TauriFileHandle(path);
  }

  async cleanTempDirectory(): Promise<void> {
    const tempDir = await this.getAppDataDirectory("temp");
    for await (const [name] of tempDir.entries()) {
      await tempDir.removeEntry(name, {recursive: true});
    }
  }

<<<<<<< HEAD:src/tauri/persistence/TauriDirectoryProvider.ts
    async getHomeDirectory(): Promise<FileSystemDirectoryHandle> {
        console.log(`Home directory: ${this.userHome}`);
        return new TauriDirectoryHandle(this.userHome);
    }

    async getUserDataDirectory(
        appendedPath?: string,
    ): Promise<FileSystemDirectoryHandle> {
        let root = this.userHome;
        const osName = platform();
        if (!["ios", "android"].includes(osName)) {
            root = await join(root, this.appName);
        }
=======
  async openInFileManager(path: string): Promise<void> {
    open(path);
  }

  get databaseDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("database");
  }
>>>>>>> baf35fb (merge back Joe's fs work):src/tauri/domain/persistence/tauriDirectoryProvider.ts

  get resourceContainerDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("rc");
  }

<<<<<<< HEAD:src/tauri/persistence/TauriDirectoryProvider.ts
    async getAppDataDirectory(
        appendedPath?: string,
    ): Promise<FileSystemDirectoryHandle> {
        const path = appendedPath
            ? await join(await appLocalDataDir(), appendedPath)
            : await appLocalDataDir();
        await mkdir(path, { recursive: true });
        console.log(`App data directory: ${path}`);
        return new TauriDirectoryHandle(path);
    }

    async getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ): Promise<FileSystemDirectoryHandle> {
        const targetCreator = target?.creator ?? ".";
        const baseDir = await this.getUserDataDirectory();
        const path = await join(
            baseDir.path,
            this.appName,
            targetCreator,
            source.creator,
            `${source.language.slug}_${source.identifier}`,
            `v${target?.version ?? "-none"}`,
            target?.language?.slug ?? "no_language",
            bookSlug,
        );
        await mkdir(path, { recursive: true });
        console.log(`Project directory: ${path}`);
        return new TauriDirectoryHandle(path);
    }
    async getDirectoryHandle(
        path: string,
        opts?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle> {
        if (opts?.create) await mkdir(path, { recursive: true });
        return new TauriDirectoryHandle(path);
    }
=======
  get internalSourceRCDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("rc/src");
  }

  get userProfileImageDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("users/images");
  }
>>>>>>> baf35fb (merge back Joe's fs work):src/tauri/domain/persistence/tauriDirectoryProvider.ts

  get userProfileAudioDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("users/audio");
  }

  get audioPluginDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("plugins");
  }

  get versificationDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("versification");
  }

<<<<<<< HEAD:src/tauri/persistence/TauriDirectoryProvider.ts
    async createTempFile(
        prefix: string,
        suffix?: string,
    ): Promise<FileSystemFileHandle> {
        const path = await join(
            this.userHome,
            this.appName,
            "temp",
            `${prefix}${suffix ?? ""}`,
        );
        await mkdir(await join(this.userHome, this.appName, "temp"), {
            recursive: true,
        });
        return new TauriFileHandle(path);
    }
=======
  get logsDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("logs");
  }
>>>>>>> baf35fb (merge back Joe's fs work):src/tauri/domain/persistence/tauriDirectoryProvider.ts

  get cacheDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("cache");
  }

<<<<<<< HEAD:src/tauri/persistence/TauriDirectoryProvider.ts
    async openInFileManager(path: string): Promise<void> {
        open(path);
    }

    get databaseDirectory(): Promise<FileSystemDirectoryHandle> {
        return this.getAppDataDirectory("database");
    }

    get logsDirectory(): Promise<FileSystemDirectoryHandle> {
        return this.getAppDataDirectory("logs");
    }

    get cacheDirectory(): Promise<FileSystemDirectoryHandle> {
        return this.getAppDataDirectory("cache");
    }

    get tempDirectory(): Promise<FileSystemDirectoryHandle> {
        return this.getAppDataDirectory("temp");
    }
=======
  get tempDirectory(): Promise<TauriDirectoryHandle> {
    return this.getAppDataDirectory("temp");
  }
>>>>>>> baf35fb (merge back Joe's fs work):src/tauri/domain/persistence/tauriDirectoryProvider.ts
}
