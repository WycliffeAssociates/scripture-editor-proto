import { isTauri } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import * as fs from "@tauri-apps/plugin-fs";
export class TauriFS {
    private baseDir: string;
    private baseDirEnum: fs.BaseDirectory;

    constructor(
        baseDir: string = "",
        baseDirEnum: fs.BaseDirectory = fs.BaseDirectory.AppData,
    ) {
        this.baseDir = baseDir;
        this.baseDirEnum = baseDirEnum;
    }

    private async resolvePath(path: string): Promise<string> {
        if (this.baseDir) {
            return join(this.baseDir, path);
        }
        return path;
    }

    promises = {
        readFile: async (
            path: string,
            options?: { encoding?: string; flag?: string },
        ): Promise<string | Buffer> => {
            const resolvedPath = await this.resolvePath(path);
            const content = await fs.readTextFile(resolvedPath, {
                baseDir: this.baseDirEnum,
            });

            if (
                options?.encoding === "buffer" ||
                (options?.encoding && options.encoding !== "utf8")
            ) {
                return Buffer.from(content);
            }
            return content;
        },

        writeFile: async (
            path: string,
            data: string | Uint8Array,
            _options?: { encoding?: string; mode?: number; flag?: string },
        ) => {
            const resolvedPath = await this.resolvePath(path);
            const content =
                typeof data === "string"
                    ? data
                    : new TextDecoder().decode(data);

            // Ensure the directory exists
            const dir = await dirname(resolvedPath);
            await this.promises.mkdir(dir, { recursive: true });

            await fs.writeTextFile(resolvedPath, content, {
                baseDir: this.baseDirEnum,
            });
        },

        unlink: async (path: string) => {
            const resolvedPath = await this.resolvePath(path);
            try {
                await fs.remove(resolvedPath, {
                    baseDir: this.baseDirEnum,
                    recursive: true,
                });
            } catch (error) {
                // If it's a directory, try to remove it as a directory
                if (
                    error instanceof Error &&
                    error.message.includes("Is a directory")
                ) {
                    await fs.remove(resolvedPath, {
                        baseDir: this.baseDirEnum,
                        recursive: true,
                    });
                } else {
                    throw error;
                }
            }
        },

        readdir: async (
            path: string,
            _options?: { withFileTypes?: boolean },
        ): Promise<string[]> => {
            const resolvedPath = await this.resolvePath(path);
            const entries = await fs.readDir(resolvedPath, {
                baseDir: this.baseDirEnum,
            });
            return entries.map((entry) => entry.name || "");
            // if (options?.withFileTypes) {
            //   return entries.map((entry: DirEntry) => ({
            //     name: entry.name || "",
            //     isDirectory: () => entry.children !== undefined,
            //     isFile: () => entry.children === undefined,
            //     isSymbolicLink: () => false, // Tauri v2 doesn't expose this directly
            //   }));
            // }

            // return entries.map((entry: DirEntry) => entry.name || "");
        },

        mkdir: async (
            path: string,
            options?: { recursive?: boolean; mode?: number },
        ) => {
            const resolvedPath = await this.resolvePath(path);
            await fs.mkdir(resolvedPath, {
                baseDir: this.baseDirEnum,
                recursive: options?.recursive ?? false,
            });
        },

        rmdir: async (path: string) => {
            const resolvedPath = await this.resolvePath(path);
            await fs.remove(resolvedPath, {
                baseDir: this.baseDirEnum,
                recursive: true,
            });
        },

        stat: async (path: string) => {
            const resolvedPath = await this.resolvePath(path);
            let isDir = false;
            let size = 0;

            try {
                // Try to read as directory first
                const _entries = await fs.readDir(resolvedPath, {
                    baseDir: this.baseDirEnum,
                });
                isDir = true;
                size = 0; // For directories, size is typically 0
            } catch (error) {
                // If it's not a directory, try to read as file
                if (
                    error instanceof Error &&
                    error.message.includes("Not a directory")
                ) {
                    try {
                        const content = await fs.readTextFile(resolvedPath, {
                            baseDir: this.baseDirEnum,
                        });
                        size = new TextEncoder().encode(content).length;
                    } catch (fileError) {
                        if (fileError instanceof Error) {
                            throw new Error(
                                `Neither a file nor a directory: ${path}: ${fileError.message}`,
                            );
                        }
                        throw new Error(
                            `Neither a file nor a directory: ${path}`,
                        );
                    }
                } else {
                    throw error;
                }
            }

            return {
                isDirectory: () => isDir,
                isFile: () => !isDir,
                size,
                mtime: new Date(),
                ctime: new Date(),
                atime: new Date(),
                ino: 0, // Not available in Tauri v2
                dev: 0, // Not available in Tauri v2
                mode: 0o666, // Default mode
                uid: 0, // Not available in Tauri v2
                gid: 0, // Not available in Tauri v2
            };
        },

        lstat: async (path: string) => {
            // In Tauri v2, there's no distinction between lstat and stat
            return this.promises.stat(path);
        },

        // Optional methods (not implemented in Tauri v2)
        readlink: async (_path: string): Promise<string> => {
            throw new Error("readlink not implemented in Tauri v2");
        },

        symlink: async (_target: string, _path: string): Promise<void> => {
            throw new Error("symlink not implemented in Tauri v2");
        },

        chmod: async (_path: string, _mode: string | number): Promise<void> => {
            // Not supported in Tauri v2 FS API
            return Promise.resolve();
        },

        // Helper method to check if a path exists
        exists: async (path: string) => {
            const resolvedPath = await this.resolvePath(path);
            try {
                // Try to read the directory or file to check existence
                await fs.readDir(resolvedPath, {
                    baseDir: this.baseDirEnum,
                });
                return true;
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes("Not a directory")
                ) {
                    // It's a file, which means it exists
                    return true;
                }
                return false;
            }
        },
    };
}

// Create a default instance
export const tauriFs = new TauriFS();

// Factory function to get the appropriate FS implementation
export async function getFs() {
    if (isTauri()) {
        return tauriFs;
    }

    // In the future, we can add a fallback to IndexedDB here
    throw new Error(
        "Running in browser - IndexedDB implementation not yet available",
    );
}
