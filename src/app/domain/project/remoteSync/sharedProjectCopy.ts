import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { CloudStatusButtonState } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";

/**
 * Single source of truth for all user-facing "shared project" copy — the words
 * we use instead of the underlying git/Gitea vocabulary (no cloud / remote /
 * repository / sync / publish / fork / clone in the UI).
 *
 * Everything is a lingui `msg` so strings still extract; callers resolve with
 * `i18n._()` (or `useLingui`). Keeping the wording here — rather than scattered
 * across the toolbar chip, the status popover, settings, and notifications —
 * means the vocabulary maps 1:1 to the remote-sync state machine and can be
 * edited in one place without the surfaces drifting apart.
 *
 * Vocabulary anchor: the online project is "the shared project" (the one a team
 * can be given access to); a personal copy is "my own copy" and is private
 * until collaborators are added.
 */

type SharedProjectStateKey =
    | "refreshing"
    | "none"
    | "connected"
    | "changesToSend"
    | "updatesToReceive"
    | "needsReview"
    | "offline"
    | "signInAgain";

type SharedProjectStatePresentation = {
    /** Drives the chip's color/icon token. */
    buttonState: CloudStatusButtonState;
    /** Short chip label on the toolbar. */
    chip: MessageDescriptor;
    /** Popover/banner headline. */
    headline: MessageDescriptor;
    /** Popover/banner explanatory line. */
    detail: MessageDescriptor;
};

const SHARED_PROJECT_STATES: Record<
    SharedProjectStateKey,
    SharedProjectStatePresentation
> = {
    refreshing: {
        buttonState: "syncing",
        chip: msg`Checking…`,
        headline: msg`Checking the shared project…`,
        detail: msg`Looking for changes to send or receive.`,
    },
    none: {
        buttonState: "connected",
        chip: msg`Shared project`,
        headline: msg`Shared project`,
        detail: msg`Open shared project status.`,
    },
    connected: {
        buttonState: "connected",
        chip: msg`Up to date`,
        headline: msg`Up to date with the shared project`,
        detail: msg`Your local work and the shared project match.`,
    },
    changesToSend: {
        buttonState: "behind",
        chip: msg`Changes to send`,
        headline: msg`You have changes to send`,
        detail: msg`Your latest work is saved here but not yet in the shared project.`,
    },
    updatesToReceive: {
        buttonState: "behind",
        chip: msg`Updates to receive`,
        headline: msg`There are updates to receive`,
        detail: msg`The shared project has new changes you don't have yet.`,
    },
    needsReview: {
        buttonState: "diverged",
        chip: msg`Needs review`,
        headline: msg`Some changes need your review`,
        detail: msg`Your changes and the shared project's changes overlap. Review them before sending your work.`,
    },
    offline: {
        buttonState: "behind",
        chip: msg`Offline`,
        headline: msg`You're offline`,
        detail: msg`Your work is still saved here. You can send it once you're back online.`,
    },
    signInAgain: {
        buttonState: "diverged",
        chip: msg`Sign in again`,
        headline: msg`Sign in to keep sharing`,
        detail: msg`Sending and receiving updates is paused until you sign in again.`,
    },
};

/** Action labels — referenced by the status popover, settings, and the picker. */
export const sharedProjectActions = {
    send: msg`Send my changes`,
    sending: msg`Sending…`,
    receive: msg`Receive updates`,
    receiving: msg`Receiving…`,
    review: msg`Review changes`,
    sendAndReceive: msg`Send & receive updates`,
    connect: msg`Connect to a shared project`,
    connecting: msg`Connecting…`,
    saveAsNew: msg`Save as a new shared project`,
    creating: msg`Creating…`,
    makeLocalCopy: msg`Make a local copy to edit`,
    saveOwnCopyOnline: msg`Save my own copy online`,
} as const;

/** Standalone labels and notification copy that mention the shared project. */
export const sharedProjectLabels = {
    sharedProject: msg`Shared project`,
    link: msg`Shared project link`,
    notConnected: msg`Not connected`,
    lastUpdate: msg`Last update in the shared project`,
    incomingChanges: msg`Incoming shared changes`,
    autoSendTitle: msg`Send changes automatically`,
    autoSendDescription: msg`Send my changes to the shared project automatically when I save.`,
    autoReceiveTitle: msg`Check for updates on open`,
    autoReceiveDescription: msg`Check for updates when I open this project.`,
    sendFailedTitle: msg`Couldn't send your changes`,
    sendFailedBody: msg`Your work is saved here, but it couldn't be sent to the shared project.`,
} as const;

function sharedProjectStateKey(
    status: GitRemoteProjectStatus | null,
    isRefreshing: boolean,
): SharedProjectStateKey {
    if (isRefreshing) return "refreshing";
    if (!status) return "none";
    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return "connected";
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return "changesToSend";
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return "updatesToReceive";
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return "needsReview";
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return "offline";
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return "signInAgain";
    }
}

export type SharedProjectStatusPresentation = {
    buttonState: CloudStatusButtonState;
    chipLabel: string;
    headline: string;
    detail: string;
};

/** Resolve the chip + popover copy for the current remote-sync state. */
export function presentSharedProjectStatus(args: {
    status: GitRemoteProjectStatus | null;
    isRefreshing: boolean;
    i18n: I18n;
}): SharedProjectStatusPresentation {
    const state =
        SHARED_PROJECT_STATES[
            sharedProjectStateKey(args.status, args.isRefreshing)
        ];
    return {
        buttonState: state.buttonState,
        chipLabel: args.i18n._(state.chip),
        headline: args.i18n._(state.headline),
        detail: args.i18n._(state.detail),
    };
}
