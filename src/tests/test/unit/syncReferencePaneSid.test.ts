// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { findBestReferenceScrollTarget } from "@/app/domain/editor/listeners/syncReferencePaneSid.ts";

describe("findBestReferenceScrollTarget", () => {
    it("prefers a visible text token over a hidden marker for the same sid", () => {
        const refPanel = document.createElement("div");

        const hiddenMarker = document.createElement("span");
        hiddenMarker.dataset.sid = "GEN 1:1";
        hiddenMarker.dataset.tokenType = "marker";
        hiddenMarker.style.display = "none";

        const visibleText = document.createElement("span");
        visibleText.dataset.sid = "GEN 1:1";
        visibleText.dataset.tokenType = "text";
        visibleText.textContent = "Visible verse text";

        Object.defineProperty(visibleText, "getClientRects", {
            value: () => [{ width: 10, height: 10 }],
        });

        refPanel.append(hiddenMarker, visibleText);

        const result = findBestReferenceScrollTarget(refPanel, "GEN 1:1");

        expect(result).toBe(visibleText);
    });
});
