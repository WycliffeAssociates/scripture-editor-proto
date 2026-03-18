import type { BuildSidBlocksOptions } from "@/core/domain/usfm/usfmOnionTypes.ts";

export function defaultBuildSidBlocksOptions(): BuildSidBlocksOptions {
    return { allowEmptySid: true };
}
