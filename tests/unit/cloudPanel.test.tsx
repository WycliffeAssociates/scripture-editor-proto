// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudPanelContent } from "@/app/ui/components/views/bottom-panel/CloudPanel.tsx";

const useWorkspaceContextMock = vi.fn();

vi.mock("@/app/ui/hooks/useWorkspaceContext.tsx", () => ({
    useWorkspaceContext: () => useWorkspaceContextMock(),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
    (
        globalThis as typeof globalThis & {
            IS_REACT_ACT_ENVIRONMENT?: boolean;
        }
    ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    useWorkspaceContextMock.mockReturnValue({
        project: {
            appSettings: {
                autoAcceptIncomingWork: false,
                autoSyncOnOpen: true,
                autoPushOnSave: true,
            },
        },
        remote: {
            status: {
                projectPath: "/userData/projects/foo",
                kind: "remoteUpdatesAvailable",
                lastCheckedAt: "2026-03-31T10:00:00.000Z",
                lastPublishedAt: "2026-03-30T08:00:00.000Z",
                lastKnownLocalHead: "local-head",
                lastKnownRemoteHead: "remote-head",
                latestIncomingAuthorName: "alice",
            },
            projectInfo: {
                schemaVersion: 1,
                projectPath: "/userData/projects/foo",
                hostBaseUrl: "https://gitea.example.org",
                repoId: "1",
                repoOwner: "alice",
                repoName: "foo",
                repoUrl: "https://gitea.example.org/alice/foo",
                trackedBranch: "master",
            },
            isRefreshing: false,
            syncNow: vi.fn(),
            reviewIncoming: vi.fn(),
        },
    });
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
    });
}

describe("CloudPanelContent", () => {
    it("shows the latest incoming author and remote project without raw git heads", () => {
        render(<CloudPanelContent />);

        expect(document.body.textContent).toContain(
            "Latest changes are from alice.",
        );
        expect(document.body.textContent).toContain("alice/foo");
        expect(document.body.textContent).not.toContain("Local head");
        expect(document.body.textContent).not.toContain("Cloud head");
    });
});
