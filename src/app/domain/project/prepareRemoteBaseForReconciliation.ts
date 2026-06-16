import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
  type GitRemoteRelationshipKind,
} from "@/core/persistence/gitRemoteRelationship.ts";

import { adoptRemoteLatestAsLocalBase } from "./adoptRemoteLatestAsLocalBase.ts";

/**
 * Prepare local git history so the next save commit can sit on top of the
 * reviewed remote base.
 *
 * The compare UI decides the final working USFM state; this helper only adjusts
 * git ancestry underneath it.
 */
export async function prepareRemoteBaseForReconciliation(args: {
  projectPath: string;
  trackedBranch: string;
  remoteHead: string;
  relationship: GitRemoteRelationshipKind;
  gitProvider: GitProvider;
}) {
  if (
    args.relationship !== GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
    args.relationship !== GIT_REMOTE_RELATIONSHIP_DIVERGED
  ) {
    return null;
  }

  return adoptRemoteLatestAsLocalBase({
    projectPath: args.projectPath,
    trackedBranch: args.trackedBranch,
    remoteHead: args.remoteHead,
    gitProvider: args.gitProvider,
  });
}
