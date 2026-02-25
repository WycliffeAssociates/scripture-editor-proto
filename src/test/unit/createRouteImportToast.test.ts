import { describe, expect, it } from "vitest";
import {
    buildPersistentImportSuccessNotification,
    getProjectParamFromImportedPath,
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
});
