import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";

export interface IOpener {
  open?(dir: string): Promise<void>;
  export(dir: IDirectoryHandle, filename?: string): Promise<void>;
}
