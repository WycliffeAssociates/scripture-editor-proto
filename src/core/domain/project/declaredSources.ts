import { parseResourceContainer } from "@/core/domain/project/resourceContainer/resourceContainer.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

/**
 * A source text a project declares it was translated/adapted from. Both the RC
 * manifest (`dublin_core.source[]`) and the Burrito metadata (`source[]`) carry
 * this same `{ identifier, language }` shape.
 */
export type DeclaredSource = {
    identifier: string;
    language: string;
};

const MANIFEST_FILENAME = "manifest.yaml";
const BURRITO_METADATA_FILENAME = "metadata.json";

function normalizeSources(
    raw: ReadonlyArray<{ identifier?: unknown; language?: unknown }>,
): DeclaredSource[] {
    const out: DeclaredSource[] = [];
    for (const entry of raw) {
        const identifier =
            typeof entry?.identifier === "string" ? entry.identifier : "";
        const language =
            typeof entry?.language === "string" ? entry.language : "";
        if (identifier && language) out.push({ identifier, language });
    }
    return out;
}

/**
 * Read the source texts a managed project declares.
 *
 * The RC manifest wins when both files are present — Burritos don't always
 * embed source yet, so the manifest is the more reliable signal.
 */
export async function readDeclaredSources(args: {
    fileSystem: FileSystem;
    projectRootPath: string;
}): Promise<DeclaredSource[]> {
    const { fileSystem, projectRootPath } = args;

    const manifestPath = `${projectRootPath}/${MANIFEST_FILENAME}`;
    if (await fileSystem.exists(manifestPath)) {
        try {
            const manifest = parseResourceContainer(
                await fileSystem.readText(manifestPath),
            );
            return normalizeSources(manifest.dublin_core?.source ?? []);
        } catch {
            // Fall through to the Burrito metadata.
        }
    }

    const burritoPath = `${projectRootPath}/${BURRITO_METADATA_FILENAME}`;
    if (await fileSystem.exists(burritoPath)) {
        try {
            const parsed = JSON.parse(await fileSystem.readText(burritoPath));
            const source = Array.isArray(parsed?.source) ? parsed.source : [];
            return normalizeSources(source);
        } catch {
            return [];
        }
    }

    return [];
}

/** True when the project declares the English ULB (`en` + `ulb`) as a source. */
export function declaresEnglishUlbSource(sources: DeclaredSource[]): boolean {
    return sources.some(
        (source) =>
            source.language.trim().toLowerCase() === "en" &&
            source.identifier.trim().toLowerCase() === "ulb",
    );
}
