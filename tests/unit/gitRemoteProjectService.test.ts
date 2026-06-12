import { describe, expect, it } from "vitest";

import {
  buildGitRemoteProjectInfo,
  buildRemoteRepoNameForProject,
} from "@/app/domain/project/gitRemoteProjectService.ts";

describe("gitRemoteProjectService helpers", () => {
  it("builds the default remote repo name from language code and project identity", () => {
    expect(
      buildRemoteRepoNameForProject({
        displayName: "Bho Bible",
        projectId: "Bible",
        language: {
          code: "bho",
          name: "Bhojpuri",
          direction: "ltr",
        },
      }),
    ).toBe("bho-bible");
  });

  it("falls back to display name when a project id is unavailable", () => {
    expect(
      buildRemoteRepoNameForProject({
        displayName: "Adhola New Testament",
        projectId: undefined,
        language: {
          code: "adh",
          name: "Adhola",
          direction: "ltr",
        },
      }),
    ).toBe("adh-adhola-new-testament");
  });

  it("builds durable remote project info with the repo default branch when present", () => {
    expect(
      buildGitRemoteProjectInfo({
        projectPath: "/userData/projects/foo",
        hostBaseUrl: "https://gitea.example.org",
        repo: {
          id: "1",
          owner: "alice",
          name: "foo",
          htmlUrl: "https://gitea.example.org/alice/foo",
          defaultBranch: "master",
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      projectPath: "/userData/projects/foo",
      hostBaseUrl: "https://gitea.example.org",
      repoId: "1",
      repoOwner: "alice",
      repoName: "foo",
      repoUrl: "https://gitea.example.org/alice/foo",
      trackedBranch: "master",
    });
  });
});
