// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TESTING_IDS } from "@/app/data/constants.ts";
import ProjectCreator from "@/app/ui/components/blocks/ProjectCreator.tsx";

vi.mock("@/app/ui/components/import/LanguageApiImporter.tsx", () => ({
    default: (props: {
        onDownload: (url: string) => void;
        isDownloadDisabled?: boolean;
        headerActions?: React.ReactNode;
    }) => (
        <div>
            <button
                type="button"
                data-testid={TESTING_IDS.language.importerDownload}
                onClick={() => props.onDownload("https://example.org/repo.git")}
                disabled={props.isDownloadDisabled}
            >
                download
            </button>
            {props.headerActions}
        </div>
    ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
    (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    if (!window.matchMedia) {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (query: string) => ({
                matches: query.includes("min-width"),
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }),
        });
    }
});

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => {
        root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    document.body.innerHTML = "";
});

function render(ui: React.ReactNode) {
    act(() => {
        root?.render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
    });
}

describe("ProjectCreator", () => {
    it("uses the provided trigger actions and hidden input refs", () => {
        const onDownload = vi.fn();
        const onDirectoryAction = vi.fn();
        const onZipAction = vi.fn();
        const onDirectorySelected = vi.fn();
        const onZipSelected = vi.fn();
        const directoryInputRef = createRef<HTMLInputElement>();
        const zipInputRef = createRef<HTMLInputElement>();

        render(
            <ProjectCreator
                onDownload={onDownload}
                onDirectoryAction={onDirectoryAction}
                onZipAction={onZipAction}
                onDirectorySelected={onDirectorySelected}
                onZipSelected={onZipSelected}
                directoryInputRef={directoryInputRef}
                zipInputRef={zipInputRef}
            />,
        );

        const buttons = document.querySelectorAll("button");
        act(() => {
            (buttons[1] as HTMLButtonElement).click();
            (buttons[2] as HTMLButtonElement).click();
            (buttons[0] as HTMLButtonElement).click();
        });

        expect(onDirectoryAction).toHaveBeenCalledTimes(1);
        expect(onZipAction).toHaveBeenCalledTimes(1);
        expect(onDownload).toHaveBeenCalledWith("https://example.org/repo.git");
        expect(directoryInputRef.current).not.toBeNull();
        expect(zipInputRef.current).not.toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.import.dirImporter}"]`,
            ),
        ).not.toBeNull();
        expect(
            document.querySelector(
                `[data-testid="${TESTING_IDS.import.importer}"]`,
            ),
        ).not.toBeNull();
    });

    it("disables all triggers while importing", () => {
        render(
            <ProjectCreator
                onDownload={vi.fn()}
                onDirectoryAction={vi.fn()}
                onZipAction={vi.fn()}
                isImporting
            />,
        );

        const buttons = [...document.querySelectorAll("button")];
        expect(
            buttons.every((button) => (button as HTMLButtonElement).disabled),
        ).toBe(true);
    });
});
