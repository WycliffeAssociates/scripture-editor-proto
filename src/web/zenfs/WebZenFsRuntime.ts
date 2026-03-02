import { configureSingle, fs } from "@zenfs/core";
import { WebAccess } from "@zenfs/dom";
import { Buffer } from "buffer";

export class WebZenFsRuntime {
    private configured: Promise<void> | null = null;
    readonly fs = fs;

    async ensureReady(): Promise<void> {
        const globalRef = globalThis as typeof globalThis & {
            Buffer?: typeof Buffer;
        };
        if (!globalRef.Buffer) {
            globalRef.Buffer = Buffer;
        }

        if (!this.configured) {
            this.configured = (async () => {
                const root = await navigator.storage.getDirectory();
                await configureSingle({
                    backend: WebAccess,
                    handle: root,
                });
            })();
        }
        await this.configured;
    }
}
