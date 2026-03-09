import { describe, expect, it } from "vitest";
import {
    buildPersistentImportSuccessNotification,
    getProjectParamFromImportedPath,
    resolveImportErrorMessage,
} from "@/app/routes/create.tsx";

describe("create route import toast helpers", () => {
    it("extracts project param from imported path", () => {
        expect(
            getProjectParamFromImportedPath("/userData/projects/en_ulb (1)"),
        ).toBe("en_ulb (1)");
        expect(getProjectParamFromImportedPath("en_ulb")).toBe("en_ulb");
    });

    it("returns null for empty imported path", () => {
        expect(getProjectParamFromImportedPath("")).toBeNull();
        expect(getProjectParamFromImportedPath(null)).toBeNull();
        expect(getProjectParamFromImportedPath(undefined)).toBeNull();
    });

    it("builds persistent notification options", () => {
        const notification = buildPersistentImportSuccessNotification(
            "Success",
            "File imported successfully!",
        );

        expect(notification.title).toBe("Success");
        expect(notification.message).toBe("File imported successfully!");
        expect(notification.autoClose).toBe(false);
        expect(notification.withCloseButton).toBe(true);
    });

    it("keeps specific import error messages", () => {
        expect(
            resolveImportErrorMessage({
                error: new Error("Detailed underlying import failure"),
                fallback: "Failed to import file",
            }),
        ).toBe("Failed to import file. Detailed underlying import failure");
    });

    it("includes debug details when available", () => {
        const error = Object.assign(new Error("Failed to import file"), {
            code: "ENOENT",
            name: "NotFoundError",
        });
        expect(
            resolveImportErrorMessage({
                error,
                fallback: "Failed to import file",
            }),
        ).toContain(
            "Failed to import file. Debug: name=NotFoundError, code=ENOENT, message=Failed to import file",
        );
    });

    it("uses fallback for unknown import errors", () => {
        expect(
            resolveImportErrorMessage({
                error: null,
                fallback: "Failed to import file",
            }),
        ).toBe("Failed to import file");
    });
});
