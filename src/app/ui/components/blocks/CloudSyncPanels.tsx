import { Trans } from "@lingui/react/macro";
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  Clock,
  CloudDownload,
  CloudOff,
  Copy,
  LogOut,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import * as base from "@/app/ui/styles/modules/CloudStatusPopover.css.ts";
import * as p from "@/app/ui/styles/modules/cloudSyncPanels.css.ts";

/**
 * Presentational building blocks for the cloud-sync popover redesign. Pure —
 * no hooks beyond local UI state (copy feedback). Both the real popover
 * (CloudStatusPopover.tsx) and the /playground state gallery render these, so
 * the design lives in exactly one place.
 */

export type CloudSyncTone = "ok" | "incoming" | "warn" | "neutral";

function CloudSyncStatusIcon(props: { tone: CloudSyncTone }) {
  switch (props.tone) {
    case "warn":
      return (
        <TriangleAlert
          size={22}
          color={vars.color.onSurfaceError}
          aria-hidden
        />
      );
    case "incoming":
      // Not a green check — signals "there's something you don't have yet".
      return (
        <CloudDownload size={22} color={vars.color.brandBase} aria-hidden />
      );
    case "neutral":
      return (
        <CloudOff size={22} color={vars.color.onSurfaceTertiary} aria-hidden />
      );
    default:
      return (
        <CircleCheck
          size={22}
          color={vars.color.onSurfaceSuccess}
          aria-hidden
        />
      );
  }
}

/** Centered status icon + constant "Project Sync" title + state subtitle. */
export function CloudSyncHeader(props: {
  tone: CloudSyncTone;
  subtitle: ReactNode;
}) {
  return (
    <div className={p.header}>
      <CloudSyncStatusIcon tone={props.tone} />
      <h3 className={base.heading}>
        <Trans>Project Sync</Trans>
      </h3>
      <p className={base.body} style={{ margin: 0 }}>
        {props.subtitle}
      </p>
    </div>
  );
}

/** Surfaced "needs review" affordance; opens the review flow on click. */
export function CloudReviewBanner(props: {
  detail: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={p.reviewBanner} onClick={props.onClick}>
      <span className={p.reviewBannerText}>
        <span className={p.reviewBannerLabel}>
          <Trans>Needs review</Trans>
        </span>
        <span className={p.reviewBannerDetail}>{props.detail}</span>
      </span>
      <ArrowRight size={18} aria-hidden style={{ flex: "0 0 auto" }} />
    </button>
  );
}

/**
 * Local-vs-shared version timestamps. The shared line names the last committer
 * when known; the local line never does (that's us). Pass already-formatted
 * relative-time strings.
 */
export function CloudDualClocks(props: {
  localTime: string;
  sharedTime: string;
  sharedAuthor?: string | null;
}) {
  return (
    <div className={p.clocks}>
      <span className={p.clockItem}>
        <Clock size={13} aria-hidden />
        <span>
          <Trans>Local version</Trans>{" "}
          <span className={p.clockTime}>{props.localTime}</span>
        </span>
      </span>
      <span className={p.clockItem}>
        <Clock size={13} aria-hidden />
        <span>
          <Trans>Shared version</Trans>{" "}
          <span className={p.clockTime}>{props.sharedTime}</span>
          {props.sharedAuthor ? (
            <>
              {" "}
              <Trans>by {props.sharedAuthor}</Trans>
            </>
          ) : null}
        </span>
      </span>
    </div>
  );
}

/**
 * One "Project details" dropdown: the shared-project link with a copy button on
 * top, and an optional send & receive settings subsection (passed as children)
 * divided off at the bottom.
 */
export function CloudProjectDetails(props: {
  repoUrl: string | null;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <details>
      <summary className={p.detailsSummary}>
        <span className={p.detailsChevron} aria-hidden="true">
          <ChevronRight size={12} />
        </span>
        <Trans>Project details</Trans>
      </summary>
      <div className={p.detailsBody}>
        {props.repoUrl ? (
          <div>
            <span className={base.label}>
              <Trans>Shared project link</Trans>
            </span>
            <div className={p.urlRow}>
              <span className={p.url}>{props.repoUrl}</span>
              <button
                type="button"
                className={p.copyButton}
                onClick={() => {
                  void navigator.clipboard?.writeText(props.repoUrl ?? "");
                  setCopied(true);
                }}
              >
                <Copy size={14} aria-hidden />
                {copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
              </button>
            </div>
          </div>
        ) : null}
        {props.children ? (
          <div className={p.subsection}>
            <span className={base.label}>
              <Trans>Send & receive settings</Trans>
            </span>
            {props.children}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Sign-in form. OTP-free; Sign In is disabled until both fields have content;
 * shows an inline error and a Create Account link. `embedded` drops the header
 * for the reauth case (it sits inside the connected panel).
 */
export function CloudSignInForm(props: {
  hostConfigured: boolean;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  errorMessage?: string | null;
  createAccountUrl?: string | null;
  embedded?: boolean;
}) {
  const canSubmit =
    props.username.trim().length > 0 && props.password.length > 0;
  return (
    <div className={p.loginForm}>
      {props.embedded ? null : (
        <div className={p.loginHeader}>
          <h3 className={base.heading}>
            <Trans>Sign in to sync your project</Trans>
          </h3>
          <p className={base.body} style={{ margin: 0 }}>
            <Trans>
              To save your work online and collaborate with others, sign in to
              your WACS account.
            </Trans>
          </p>
          <p className={p.localAssurance}>
            <Trans>Your project is already being saved on this device.</Trans>
          </p>
        </div>
      )}
      {props.hostConfigured ? (
        <>
          <label className={base.fieldGroup}>
            <span className={base.label}>
              <Trans>Username</Trans>
            </span>
            <input
              type="text"
              className={base.input}
              value={props.username}
              onChange={(e) => props.onUsernameChange(e.currentTarget.value)}
            />
          </label>
          <label className={base.fieldGroup}>
            <span className={base.label}>
              <Trans>Password</Trans>
            </span>
            <input
              type="password"
              className={base.input}
              value={props.password}
              onChange={(e) => props.onPasswordChange(e.currentTarget.value)}
            />
          </label>
          {props.errorMessage ? (
            <p className={p.errorText}>{props.errorMessage}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={!canSubmit || props.isSubmitting}
            onClick={props.onSubmit}
            style={{ width: "100%" }}
          >
            {props.isSubmitting ? (
              <Trans>Signing in…</Trans>
            ) : (
              <Trans>Sign In</Trans>
            )}
          </Button>
          <p className={p.createAccountRow}>
            <Trans>Don't have an account?</Trans>{" "}
            <a
              className={p.createAccountLink}
              href={props.createAccountUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <Trans>Create Account</Trans>
            </a>
          </p>
        </>
      ) : (
        <p className={base.body}>
          <Trans>Cloud login is not configured for this build yet.</Trans>
        </p>
      )}
    </div>
  );
}

/**
 * Inline failure block for cloud actions (create / connect / save own copy),
 * shown in-panel instead of a toast. Background carries it; no border.
 */
export function CloudActionError(props: { title: string; message: string }) {
  return (
    <div className={p.actionError}>
      <span className={p.actionErrorTitle}>{props.title}</span>
      <span className={p.actionErrorMessage}>{props.message}</span>
    </div>
  );
}

/**
 * Sign-out affordance shown once a session exists. An account-level action set
 * apart by a hairline divider: identity on the left, a compact `destructive`
 * logout tucked at the inline end (not full-width) so reaching it is deliberate
 * and won't be fat-fingered when aiming for the Project details disclosure.
 */
export function CloudLogoutButton(props: {
  onLogout: () => void;
  username?: string | null;
}) {
  return (
    <div className={p.accountFooter}>
      {props.username ? (
        <span className={p.accountIdentity}>
          <Trans>Signed in as {props.username}</Trans>
        </span>
      ) : (
        <span />
      )}
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={props.onLogout}
      >
        <span className={p.inlineIconLabel}>
          <LogOut size={14} aria-hidden />
          <Trans>Log out</Trans>
        </span>
      </Button>
    </div>
  );
}
