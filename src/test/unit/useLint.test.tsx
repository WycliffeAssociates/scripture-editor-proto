// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { type UseLintReturn, useLint } from "@/app/ui/hooks/useLint.tsx";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeError(overrides: Partial<LintIssue>): LintIssue {
    return {
        message: "msg",
        code: "unknown-token",
        severity: "warning",
        marker: null,
        messageParams: {},
        sid: "GEN 1:1",
        tokenId: "n1",
        relatedTokenId: null,
        span: { start: 0, end: 1 },
        relatedSpan: null,
        fix: null,
        ...overrides,
    };
}

function Harness(props: {
    initialLintErrorsByBook: Record<string, LintIssue[]>;
    onRender: (value: UseLintReturn) => void;
}) {
    const lint = useLint({
        initialLintErrorsByBook: props.initialLintErrorsByBook,
    });
    props.onRender(lint);
    return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
    if (root) {
        act(() => {
            root?.unmount();
        });
    }
    container?.remove();
    root = null;
    container = null;
});

describe("useLint", () => {
    it("derives a flat list from book-keyed state and updates one book atomically", () => {
        let latest: UseLintReturn | null = null;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        act(() => {
            root?.render(
                <Harness
                    initialLintErrorsByBook={{
                        GEN: [makeError({ sid: "GEN 1:1", tokenId: "gen-1" })],
                        EXO: [makeError({ sid: "EXO 1:1", tokenId: "exo-1" })],
                    }}
                    onRender={(value) => {
                        latest = value;
                    }}
                />,
            );
        });

        const current = () => {
            if (!latest) throw new Error("Expected lint hook to render");
            return latest;
        };

        expect(current().messages.map((issue) => issue.tokenId)).toEqual([
            "gen-1",
            "exo-1",
        ]);

        act(() => {
            current().replaceErrorsForBook("GEN", [
                makeError({ sid: "GEN 2:1", tokenId: "gen-2" }),
            ]);
        });

        expect(
            current().messagesByBook.GEN?.map((issue) => issue.tokenId),
        ).toEqual(["gen-2"]);
        expect(
            current().messagesByBook.EXO?.map((issue) => issue.tokenId),
        ).toEqual(["exo-1"]);
        expect(current().messages.map((issue) => issue.tokenId)).toEqual([
            "gen-2",
            "exo-1",
        ]);
    });
});
