import { Trans, useLingui } from "@lingui/react/macro";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useState } from "react";

import { sharedProjectLabels } from "@/app/domain/project/remoteSync/sharedProjectCopy.ts";
import {
  CloudActionError,
  CloudDualClocks,
  CloudLogoutButton,
  CloudProjectDetails,
  CloudReviewBanner,
  CloudSignInForm,
  CloudSyncHeader,
} from "@/app/ui/components/blocks/CloudSyncPanels.tsx";
import { AttachResolveStatus } from "@/app/ui/components/blocks/SharedProjectAttach/AttachResolveStatus.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import type { AttachResolveState } from "@/app/ui/hooks/useSharedProjectPicker.ts";
import {
  darkThemeClass,
  lightThemeClass,
  vars,
} from "@/app/ui/styles/designSystem.css.ts";
import * as styles from "@/app/ui/styles/modules/CloudStatusPopover.css.ts";

/**
 * Internal profiling/maintenance route.
 *
 * Cloud-sync popover state gallery. Renders every state the popover can be in,
 * all at once, by composing the SAME shared presentational components the real
 * popover uses (CloudSyncPanels.tsx + AttachResolveStatus). Only the data is
 * faked — change a panel's design in CloudSyncPanels and it changes here and in
 * the live popover together. Kept around as a living design reference; delete
 * when it stops earning its keep.
 */
export const Route = createLazyFileRoute("/playground")({
  component: PlaygroundRoute,
});

// Two distinct moments so the local-vs-shared granularity is visible.
const FAKE_LOCAL_AGO_MIN = 3;
const FAKE_SHARED_AGO_MIN = 122;
const FAKE_SHARED_AUTHOR = "Robin";
const FAKE_REPO_URL = "https://content.bibletranslationtools.org/Batman/mat";

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

/** Minutes-ago → "3 minutes ago" / "2 hours ago", via Intl.RelativeTimeFormat. */
function formatMinutesAgo(minutesAgo: number): string {
  if (minutesAgo < 60) return RELATIVE_TIME.format(-minutesAgo, "minute");
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return RELATIVE_TIME.format(-hours, "hour");
  return RELATIVE_TIME.format(-Math.round(hours / 24), "day");
}

const localTime = formatMinutesAgo(FAKE_LOCAL_AGO_MIN);
const sharedTime = formatMinutesAgo(FAKE_SHARED_AGO_MIN);

export function PlaygroundRoute() {
  const [autoAccept, setAutoAccept] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [dark, setDark] = useState(false);

  const reviewLabel = autoAccept ? (
    <Trans>Sync now</Trans>
  ) : (
    <Trans>Review changes</Trans>
  );

  return (
    <div
      className={dark ? darkThemeClass : lightThemeClass}
      data-theme={dark ? "dark" : "light"}
      style={{ ...pageStyle, colorScheme: dark ? "dark" : "light" }}
    >
      <header style={headerStyle}>
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            color: vars.color.onSurfacePrimary,
          }}
        >
          Cloud sync popover — state gallery
        </h1>
        <p
          style={{
            margin: 0,
            color: vars.color.onSurfaceSecondary,
            fontSize: "0.875rem",
          }}
        >
          Composed from the same shared components as the live popover. Toggle
          the dials to see how action labels and panels change.
        </p>
        <div style={dialsRowStyle}>
          <span style={dialStyle}>
            <Switch checked={autoAccept} onCheckedChange={setAutoAccept} />
            Auto-accept incoming work
          </span>
          <span style={dialStyle}>
            <Switch checked={signedIn} onCheckedChange={setSignedIn} />
            Signed in
          </span>
          <span style={dialStyle}>
            <Switch checked={dark} onCheckedChange={setDark} />
            Dark mode
          </span>
        </div>
      </header>

      <div style={galleryStyle}>
        <Panel caption="Not signed in — sign in to sync">
          <LoginPanel />
        </Panel>
        <Panel caption="Sign in — no account found (error)">
          <LoginPanel forceError />
        </Panel>

        <Panel caption="Connected — up to date">
          <ConnectedPanel
            tone="ok"
            subtitle={
              <Trans>
                Your project is up to date and safely stored locally and online.
              </Trans>
            }
            syncLabel={<Trans>Sync now</Trans>}
          />
        </Panel>
        <Panel caption="Connected — needs review">
          <ConnectedPanel
            tone="warn"
            subtitle={
              <Trans>
                You are connected and your work has been saved, but some changes
                require review.
              </Trans>
            }
            reviewBanner
          />
        </Panel>
        <Panel caption="Connected — changes to send">
          <ConnectedPanel
            tone="ok"
            subtitle={
              <Trans>
                Click Sync now to save your changes to the shared project.
              </Trans>
            }
            syncLabel={<Trans>Sync now</Trans>}
          />
        </Panel>
        <Panel caption="Connected — updates to receive">
          <ConnectedPanel
            tone="incoming"
            subtitle={
              <Trans>
                The shared project has new changes you don't have yet.
              </Trans>
            }
            syncLabel={reviewLabel}
          />
        </Panel>

        <Panel caption="Connected — sign in again (reauth)">
          <ReauthPanel />
        </Panel>
        <Panel caption="Not uploaded — signed in">
          {signedIn ? <SignedInPanel /> : <LoginPanel />}
        </Panel>

        <Panel caption="Attach — ready to connect (writable)">
          <AttachCard state="writable" />
        </Panel>
        <Panel caption="Attach — no edit access → fork">
          <AttachCard state="not-writable" />
        </Panel>
        <Panel caption="Attach — not a shared project">
          <AttachCard state="not-shared" />
        </Panel>
        <Panel caption="Attach — couldn't open link (resolve error)">
          <AttachCard state="error" />
        </Panel>
        <Panel caption="Cloud action failed (inline error)">
          <SignedInPanel
            actionError={{
              title: "Couldn't save your own copy online",
              message:
                "You already have your own copy of this project. Connect to it instead.",
            }}
          />
        </Panel>
        <Panel caption="Log out">
          <LogoutPanel />
        </Panel>

        <Panel caption="Offline">
          <OfflinePanel />
        </Panel>
        <Panel caption="Checking… / refreshing">
          <CheckingPanel />
        </Panel>
      </div>
    </div>
  );
}

function Panel(props: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <span style={captionStyle}>{props.caption}</span>
      {/* Inherit the real popover rhythm (gap/padding) — no override, so the
			    gallery matches the live popover exactly. */}
      <div className={styles.popover} style={{ position: "static" }}>
        {props.children}
      </div>
    </div>
  );
}

function ConnectedPanel(props: {
  tone: "ok" | "incoming" | "warn";
  subtitle: React.ReactNode;
  reviewBanner?: boolean;
  syncLabel?: React.ReactNode;
}) {
  return (
    <>
      <CloudSyncHeader tone={props.tone} subtitle={props.subtitle} />
      {props.reviewBanner ? (
        <CloudReviewBanner
          detail={<Trans>Review changes before sending your work.</Trans>}
          onClick={() => {}}
        />
      ) : null}
      <CloudDualClocks
        localTime={localTime}
        sharedTime={sharedTime}
        sharedAuthor={FAKE_SHARED_AUTHOR}
      />
      {props.syncLabel ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          style={{ width: "100%" }}
        >
          {props.syncLabel}
        </Button>
      ) : null}
      <CloudProjectDetails repoUrl={FAKE_REPO_URL}>
        <FakeSettingsRows />
      </CloudProjectDetails>
      <CloudLogoutButton onLogout={() => {}} username="Batman" />
    </>
  );
}

function ReauthPanel() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <>
      <CloudSyncHeader
        tone="warn"
        subtitle={
          <Trans>
            Sending and receiving updates is paused until you sign in again.
          </Trans>
        }
      />
      <CloudSignInForm
        embedded
        hostConfigured
        username={username}
        password={password}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={() => {}}
        isSubmitting={false}
        createAccountUrl="#"
      />
    </>
  );
}

function LoginPanel(props: { forceError?: boolean }) {
  const [username, setUsername] = useState(props.forceError ? "Batman" : "");
  const [password, setPassword] = useState("");
  return (
    <CloudSignInForm
      hostConfigured
      username={username}
      password={password}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onSubmit={() => {}}
      isSubmitting={false}
      errorMessage={
        props.forceError
          ? "No account found. Double-check your username and password."
          : null
      }
      createAccountUrl="#"
    />
  );
}

function SignedInPanel(props: {
  actionError?: { title: string; message: string };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <CloudSyncHeader
        tone="neutral"
        subtitle={
          <Trans>
            Your project is saved on this device. Save it online to back it up
            and collaborate with others.
          </Trans>
        }
      />
      {/* Section 2: connect — picker + the contextual connect action. */}
      <div className={styles.section}>
        <div className={styles.fieldGroup}>
          <span className={styles.label}>
            <Trans>Connect to a shared project</Trans>
          </span>
          <button
            type="button"
            className={styles.comboboxTrigger}
            onClick={() => setSelected((s) => (s ? null : "Matthew · Batman"))}
          >
            <span className={styles.comboboxValue}>
              {selected ?? <Trans>Select a shared project</Trans>}
            </span>
            <span className={styles.comboboxChevron} aria-hidden="true">
              ⌄
            </span>
          </button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={!selected}
          style={{ width: "100%" }}
        >
          <Trans>Connect to this shared project</Trans>
        </Button>
      </div>
      {/* Section 3: the always-available "make a new one" path. */}
      <div className={styles.section}>
        {props.actionError ? (
          <CloudActionError
            title={props.actionError.title}
            message={props.actionError.message}
          />
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          style={{ width: "100%" }}
        >
          <Trans>Save as a new shared project</Trans>
        </Button>
      </div>
      <CloudLogoutButton onLogout={() => {}} username="Batman" />
    </>
  );
}

function AttachCard(props: { state: AttachResolveState }) {
  return (
    <>
      <div className={styles.fieldGroup}>
        <span className={styles.label}>
          <Trans>Connect to a shared project</Trans>
        </span>
        <span className={styles.comboboxTrigger}>
          <span className={styles.comboboxValue}>Batman/mat</span>
          <span className={styles.comboboxChevron} aria-hidden="true">
            ⌄
          </span>
        </span>
      </div>
      <AttachResolveStatus
        resolveState={props.state}
        targetLabel="Batman/mat"
        canRunActions
        isAttaching={false}
        isSavingOwnCopy={false}
        onConnect={() => {}}
        onSaveOwnCopy={() => {}}
      />
    </>
  );
}

function LogoutPanel() {
  // Demonstrates the account footer in isolation: identity left, compact
  // destructive logout tucked at the inline end.
  return <CloudLogoutButton onLogout={() => {}} username="Batman" />;
}

function OfflinePanel() {
  return (
    <>
      <h3 className={styles.heading}>
        <Trans>Offline</Trans>
      </h3>
      <p className={styles.body}>
        <Trans>
          You are currently offline, but your work is still being saved locally.
        </Trans>
      </p>
    </>
  );
}

function CheckingPanel() {
  return (
    <>
      <h3 className={styles.heading}>
        <Trans>Checking…</Trans>
      </h3>
      <p className={styles.body}>
        <Trans>
          Checking the shared project for changes to send or receive. This may
          take a moment. A window will appear to review changes if needed.
        </Trans>
      </p>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} />
      </div>
    </>
  );
}

/** Fake toggle rows so the gallery shows the Send & receive subsection copy. */
function FakeSettingsRows() {
  const { t, i18n } = useLingui();
  const rows = [
    {
      title: i18n._(sharedProjectLabels.autoReceiveTitle),
      description: i18n._(sharedProjectLabels.autoReceiveDescription),
    },
    {
      title: i18n._(sharedProjectLabels.autoSendTitle),
      description: i18n._(sharedProjectLabels.autoSendDescription),
    },
    {
      title: t`Auto Accept My Work on Save`,
      description: t`Skip review for your own local edits and commit them directly when you save.`,
    },
    {
      title: t`Auto Accept Incoming Work`,
      description: t`Accept incoming cloud changes automatically unless the same verse already has unresolved local edits.`,
    },
  ];
  return (
    <div className={styles.settingsList}>
      {rows.map((row) => (
        <div key={row.title} className={styles.settingRow}>
          <span className={styles.settingRowLabelGroup}>
            <span className={styles.settingRowTitle}>{row.title}</span>
            <span className={styles.infoIconButton} title={row.description}>
              <Info size={14} aria-hidden="true" />
            </span>
          </span>
          <Switch checked={false} onCheckedChange={() => {}} />
        </div>
      ))}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "2rem",
  background: vars.color.surfaceCanvas,
  color: vars.color.onSurfacePrimary,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const dialsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  marginTop: "0.5rem",
};

const dialStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.875rem",
  color: vars.color.onSurfacePrimary,
  cursor: "pointer",
};

const galleryStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 30rem))",
  gap: "1.5rem 2rem",
  alignItems: "start",
  justifyContent: "start",
};

const captionStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: vars.color.onSurfaceTertiary,
};
