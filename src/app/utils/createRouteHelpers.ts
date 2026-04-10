import type { NotificationData } from "@/app/ui/components/primitives/Notifications.tsx";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";

export function getProjectParamFromImportedPath(
    importedPath: string | null | undefined,
): string | null {
    if (!importedPath) return null;
    const projectParam = basenameStoragePath(importedPath);
    return projectParam || null;
}

/**
 * Build the sticky success toast shown after imports complete. Keeping this
 * outside the route folder avoids the file-based router trying to parse helper
 * modules as route definitions.
 */
export function buildPersistentImportSuccessNotification(
    title: string,
    message: string,
): NotificationData {
    return {
        title,
        message,
        autoClose: false,
        withCloseButton: true,
    };
}

function getImportErrorDebugDetails(error: unknown): string[] {
    if (error instanceof Error) {
        const details: string[] = [];
        if (error.name && error.name !== "Error") {
            details.push(`name=${error.name}`);
        }
        const maybeCode = (error as { code?: unknown }).code;
        if (typeof maybeCode === "string" && maybeCode.trim().length > 0) {
            details.push(`code=${maybeCode}`);
        }
        const message = error.message?.trim();
        if (message) {
            details.push(`message=${message}`);
        }
        return details;
    }

    if (typeof error === "string" && error.trim().length > 0) {
        return [`message=${error.trim()}`];
    }
    return [];
}

export function resolveImportErrorMessage(args: {
    error: unknown;
    fallback: string;
}): string {
    if (args.error instanceof Error) {
        const trimmed = args.error.message.trim();
        if (trimmed && trimmed !== args.fallback) {
            return `${args.fallback}. ${trimmed}`;
        }
    }

    const debugDetails = getImportErrorDebugDetails(args.error);
    if (debugDetails.length > 0) {
        return `${args.fallback}. Debug: ${debugDetails.join(", ")}`;
    }
    return args.fallback;
}
