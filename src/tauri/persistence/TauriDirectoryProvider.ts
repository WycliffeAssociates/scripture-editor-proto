import {appDataDir, appLocalDataDir, homeDir, join} from "@tauri-apps/api/path";
import {mkdir, open} from "@tauri-apps/plugin-fs";
import {platform} from "@tauri-apps/plugin-os";
import type {
  IDirectoryProvider,
  ResourceMetadata,
  IPathHandle,
  IDirectoryHandle,
  IFileHandle
} from "@/core/persistence/DirectoryProvider";
import {TauriDirectoryHandle} from "@/tauri/io/TauriDirectoryHandle.ts";
import {TauriFileHandle} from "@/tauri/io/TauriFileHandle.ts";

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

  async getHomeDirectory(): Promise<IDirectoryHandle> {
    console.log(`Home directory: ${this.userHome}`);
    return new TauriDirectoryHandle(this.userHome, this.getHandle.bind(this));
  }

  async getUserDataDirectory(
    appendedPath?: string
  ): Promise<IDirectoryHandle> {
    let root = this.userHome;
    const osName = platform();
    if (!["ios", "android"].includes(osName)) {
      root = await join(root, this.appName);
    }

    const path = appendedPath ? await join(root, appendedPath) : root;
    await mkdir(path, {recursive: true});
    console.log(`User data directory: ${path}`);
    return new TauriDirectoryHandle(path, this.getHandle.bind(this));
  }

  async getAppDataDirectory(
    appendedPath?: string
  ): Promise<IDirectoryHandle> {
    const path = appendedPath
      ? await join(await appLocalDataDir(), appendedPath)
      : await appLocalDataDir();
    await mkdir(path, {recursive: true});
    console.log(`App data directory: ${path}`);
    return new TauriDirectoryHandle(path, this.getHandle.bind(this));
  }

  async getProjectDirectory(
    source: ResourceMetadata,
    target: ResourceMetadata | null,
    bookSlug: string
  ): Promise<IDirectoryHandle> {
    const targetCreator = target?.creator ?? ".";
    const baseDir = await this.getUserDataDirectory();
    const path = await join(
      baseDir.path,
      targetCreator,
      source.creator,
      `${source.language.slug}_${source.identifier}`,
      `v${target?.version ?? "-none"}`,
      target?.language?.slug ?? "no_language",
      bookSlug
    );
    await mkdir(path, {recursive: true});
    console.log(`Project directory: ${path}`);
    return new TauriDirectoryHandle(path, this.getHandle.bind(this));
  }
  async getDirectoryHandle(
    path: string,
    opts?: {create?: boolean}
  ): Promise<IDirectoryHandle> {
    if (opts?.create) await mkdir(path, {recursive: true});
    return new TauriDirectoryHandle(path, this.getHandle.bind(this));
  }

  async getHandle(path: string): Promise<IPathHandle> {
    const fileHandle = new TauriFileHandle(path, this.getHandle.bind(this));
    try {
      await fileHandle.getFile();
      return fileHandle;
    } catch (e) {
      const dirHandle = new TauriDirectoryHandle(path, this.getHandle.bind(this));
      try {
        await dirHandle.entries().next(); // Attempt to read directory to check existence
        return dirHandle;
      } catch (e) {
        throw new Error(`Path does not exist or is not accessible: ${path}`);
      }
    }
  }

  // ---------------- File utilities ----------------

  async newFileWriter(
    filePath: string
  ): Promise<WritableStreamDefaultWriter<any>> {
    console.log("creating file writer for: " + filePath);
    const fileHandle = await this.getHandle(filePath);
    const file = fileHandle.asFileHandle();
    if (!file) throw new Error("Path is not a file: " + filePath);
    const stream = await file.createWritable();
    console.log("file writer created: " + filePath);
    const writer = stream.getWriter();
    console.log("file writer ready: " + filePath);
    return writer;
  }

  async newFileReader(filePath: string): Promise<File> {
    const fileHandle = await this.getHandle(filePath);
    const file = fileHandle.asFileHandle();
    if (!file) throw new Error("Path is not a file: " + filePath);
    return file.getFile();
  }

  async createTempFile(
    prefix: string,
    suffix?: string
  ): Promise<IFileHandle> {
    const path = await join(
      this.userHome,
      this.appName,
      "temp",
      `${prefix}${suffix ?? ""}`
    );
    await mkdir(await join(this.userHome, this.appName, "temp"), {
      recursive: true,
    });
    return new TauriFileHandle(path, this.getHandle.bind(this));
  }

  async cleanTempDirectory(): Promise<void> {
    const tempDir = await this.getAppDataDirectory("temp");
    for await (const [name] of tempDir.entries()) {
      await tempDir.removeEntry(name, {recursive: true});
    }
  }

  async openInFileManager(path: string): Promise<void> {
    await open(path);
  }

  get databaseDirectory(): Promise<IDirectoryHandle> {
    return this.getAppDataDirectory("database");
  }

  get logsDirectory(): Promise<IDirectoryHandle> {
    return this.getAppDataDirectory("logs");
  }

  get cacheDirectory(): Promise<IDirectoryHandle> {
    return this.getAppDataDirectory("cache");
  }

  get tempDirectory(): Promise<IDirectoryHandle> {
    return this.getAppDataDirectory("temp");
  }
  resolveHandle(path: string): Promise<IPathHandle> {
    return this.getHandle(path);
  }
}
