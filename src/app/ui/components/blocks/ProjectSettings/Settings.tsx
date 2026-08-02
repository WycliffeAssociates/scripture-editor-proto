import { Combobox } from "@base-ui/react/combobox";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Languages, MoonStar, Save, SunMedium } from "lucide-react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { rule_catalog, type RuleId } from "scripture-sous-chef-web";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { GET_LOCALES, type Settings } from "@/app/data/settings.ts";
import type { CloudProjectsService } from "@/app/domain/project/cloudProjectActions.ts";
import { sharedProjectLabels } from "@/app/domain/project/remoteSync/sharedProjectCopy.ts";
import { AttachResolveStatus } from "@/app/ui/components/blocks/SharedProjectAttach/AttachResolveStatus.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { showErrorNotification } from "@/app/ui/components/primitives/notifications.ts";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useCloudProjectActions } from "@/app/ui/hooks/useCloudProjectActions.ts";
import {
  type SharedProjectPicker,
  useSharedProjectPicker,
} from "@/app/ui/hooks/useSharedProjectPicker.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { IUpdaterService } from "@/core/domain/updater/IUpdaterService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

import EditorModeToggle from "./EditorModeToggle.tsx";
import FontSizeControl from "./FontSizeControl.tsx";
import * as styles from "./settings.css.ts";
import { UpdateSettingsSection } from "./UpdateSettingsSection.tsx";
import ZoomControl from "./ZoomControl.tsx";

type SettingsTab = "app-appearance" | "proofreading" | "advanced";

interface SettingsPanelProps {
  onClose?: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { actions, loadedProject, project, remote } = useWorkspaceContext();
  const {
    authSessionProvider,
    projectsService,
    updaterService,
    giteaHostBaseUrl,
  } = useRouter().options.context;
  const overlayPortalRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("app-appearance");
  const [initialSettings] = useState<Settings>(() =>
    structuredClone(project.appSettings),
  );
  const [isReverting, setIsReverting] = useState(false);

  async function applySettings(nextSettings: Settings) {
    const currentSettings = project.appSettings;

    try {
      if (nextSettings.appLanguage !== currentSettings.appLanguage) {
        await loadLocale(nextSettings.appLanguage);
      }

      if (nextSettings.colorScheme !== currentSettings.colorScheme) {
        actions.setColorScheme?.(nextSettings.colorScheme);
      }

      if (nextSettings.editorMode !== currentSettings.editorMode) {
        actions.setEditorMode?.(nextSettings.editorMode);
      }

      project.updateAppSettings({
        fontSize: nextSettings.fontSize,
        zoom: nextSettings.zoom,
        appLanguage: nextSettings.appLanguage,
        appDirection: nextSettings.appDirection,
        autoSyncOnOpen: nextSettings.autoSyncOnOpen,
        autoPushOnSave: nextSettings.autoPushOnSave,
        autoAcceptOwnWorkOnSave: nextSettings.autoAcceptOwnWorkOnSave,
        autoAcceptIncomingWork: nextSettings.autoAcceptIncomingWork,
        diffViewModeDefault: nextSettings.diffViewModeDefault,
        proofreading: nextSettings.proofreading,
      });
    } catch (error) {
      showErrorNotification({
        notification: {
          title: i18n._("Failed to save settings"),
          message:
            error instanceof Error
              ? error.message
              : i18n._("Settings could not be applied."),
        },
      });
    }
  }

  async function handleCloseWithoutSaving() {
    setIsReverting(true);

    try {
      await applySettings(initialSettings);
      onClose?.();
    } finally {
      setIsReverting(false);
    }
  }

  async function handleSettingsChange(updates: Partial<Settings>) {
    await applySettings({
      ...project.appSettings,
      ...updates,
    });
  }

  return (
    <div className={styles.panel} ref={overlayPortalRef}>
      <div className={styles.shell}>
        <div className={styles.headerOuter}>
          <div className={styles.contentInner}>
            <div className={styles.header}>
              <div className={styles.title}>
                <Trans>Settings</Trans>
              </div>
            </div>
          </div>
        </div>

        <BaseTabs.Root
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className={styles.tabsRoot}
        >
          <div className={styles.tabsListOuter}>
            <div className={styles.contentInner}>
              <BaseTabs.List className={styles.tabsList}>
                <BaseTabs.Tab
                  value="app-appearance"
                  className={styles.tabsTrigger}
                >
                  <Trans>App Appearance</Trans>
                </BaseTabs.Tab>
                <BaseTabs.Tab value="advanced" className={styles.tabsTrigger}>
                  <Trans>Advanced</Trans>
                </BaseTabs.Tab>
                <BaseTabs.Tab
                  value="proofreading"
                  className={styles.tabsTrigger}
                >
                  <Trans>Proofreading</Trans>
                </BaseTabs.Tab>
              </BaseTabs.List>
            </div>
          </div>

          <BaseTabs.Panel value="app-appearance" className={styles.tabsPanel}>
            <div className={styles.tabsPanelInner}>
              <AppAppearanceTab
                settings={project.appSettings}
                applyUpdates={handleSettingsChange}
                portalContainer={overlayPortalRef}
              />
            </div>
          </BaseTabs.Panel>

          <BaseTabs.Panel value="advanced" className={styles.tabsPanel}>
            <div className={styles.tabsPanelInner}>
              <AdvancedTab
                loadedProjectPath={loadedProject.projectPath}
                isCloudLinked={remote.status !== null}
                syncRemoteStatus={remote.syncNow}
                authSessionProvider={authSessionProvider}
                projectsService={projectsService}
                giteaHostBaseUrl={giteaHostBaseUrl}
                currentLanguageCode={loadedProject.language.code}
                settings={project.appSettings}
                applyUpdates={handleSettingsChange}
                portalContainer={overlayPortalRef}
                updaterService={updaterService}
              />
            </div>
          </BaseTabs.Panel>

          <BaseTabs.Panel value="proofreading" className={styles.tabsPanel}>
            <div className={styles.tabsPanelInner}>
              <ProofreadingTab
                settings={project.appSettings}
                applyUpdates={handleSettingsChange}
              />
            </div>
          </BaseTabs.Panel>
        </BaseTabs.Root>

        <div className={styles.footer}>
          <div className={styles.footerInner}>
            <Button
              type="button"
              variant="primary"
              size="md"
              className={styles.footerButton}
              leftIcon={<Save size={16} />}
              onClick={onClose}
            >
              <Trans>Save and Close</Trans>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className={styles.footerButton}
              onClick={() => {
                void handleCloseWithoutSaving();
              }}
              disabled={isReverting}
            >
              <Trans>Close without Saving</Trans>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProofreadingTab({
  settings,
  applyUpdates,
}: {
  settings: Settings;
  applyUpdates: (updates: Partial<Settings>) => Promise<void>;
}) {
  const catalog = rule_catalog();
  const proofreading = settings.proofreading;
  const updateRule = (code: RuleId, enabled: boolean) =>
    applyUpdates({
      proofreading: {
        ...proofreading,
        rules: { ...proofreading.rules, [code]: enabled },
      },
    });

  return (
    <div className={styles.section}>
      <SettingRow
        title={t`Review depth`}
        description={t`Choose how broadly Galley should surface review-worthy findings.`}
        control={
          <div className={styles.sliderControl}>
            <input
              className={styles.sliderInput}
              aria-label={t`Review depth`}
              type="range"
              min={catalog.review_depth.minimum}
              max={catalog.review_depth.maximum}
              value={proofreading.depth}
              onChange={(event) =>
                void applyUpdates({
                  proofreading: {
                    ...proofreading,
                    depth: Number(event.currentTarget.value),
                  },
                })
              }
            />
            <output className={styles.sliderOutput}>
              {proofreading.depth}
            </output>
          </div>
        }
      />
      {catalog.cards.map((card) => (
        <EnabledDisabledRow
          key={card.code}
          title={card.title}
          description={card.what}
          checked={proofreading.rules[card.code] !== false}
          onChange={(checked) => void updateRule(card.code, checked)}
        />
      ))}
    </div>
  );
}

export function LanguageSelector({
  value,
  onChange,
  portalContainer,
}: {
  value: string | null;
  onChange: (locale: string | null) => Promise<void> | void;
  portalContainer?: RefObject<HTMLElement | null>;
}) {
  const localeItems = Object.entries(GET_LOCALES()).map(
    ([locale, metadata]) => ({
      value: locale,
      label: i18n._(metadata.nativeName),
    }),
  );

  return (
    <SelectPrimitive
      items={localeItems}
      value={value ?? undefined}
      onValueChange={onChange}
      icon={<Languages size={18} />}
      className={styles.selectControl}
      portalContainer={portalContainer}
      placeholder={t`Select language`}
    />
  );
}

function AppAppearanceTab({
  settings,
  applyUpdates,
  portalContainer,
}: {
  settings: Settings;
  applyUpdates: (updates: Partial<Settings>) => Promise<void>;
  portalContainer: RefObject<HTMLElement | null>;
}) {
  const localeItems = Object.entries(GET_LOCALES()).map(([value, locale]) => ({
    value,
    label: i18n._(locale.nativeName),
  }));

  return (
    <div className={styles.section}>
      <SettingRow
        title={t`Interface Language`}
        description={t`Choose the display language for Sefer.`}
        control={
          <div data-testid={TESTING_IDS.settings.languageSelector}>
            <SelectPrimitive
              items={localeItems}
              value={settings.appLanguage}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }

                const locale = GET_LOCALES()[value];
                void applyUpdates({
                  appLanguage: value as Settings["appLanguage"],
                  appDirection: locale.direction,
                });
              }}
              icon={<Languages size={18} />}
              className={styles.selectControl}
              portalContainer={portalContainer}
              placeholder={t`Select language`}
            />
          </div>
        }
      />

      <SettingRow
        title={t`Display Mode`}
        description={t`Choose the theme used throughout the application.`}
        control={
          <div data-testid={TESTING_IDS.settings.themeToggle}>
            <ToggleGroup
              value={settings.colorScheme}
              onValueChange={(value) => {
                if (value === "light" || value === "dark") {
                  void applyUpdates({ colorScheme: value });
                }
              }}
              items={[
                {
                  value: "light",
                  label: t`Light`,
                  icon: <SunMedium size={16} />,
                },
                {
                  value: "dark",
                  label: t`Dark`,
                  icon: <MoonStar size={16} />,
                },
              ]}
              className={styles.toggleGroup}
            />
          </div>
        }
      />

      <SettingRow
        title={t`Editor Mode`}
        description={t`Select which editing mode you want to use.`}
        control={
          <EditorModeToggle
            value={settings.editorMode}
            onValueChange={(value) => void applyUpdates({ editorMode: value })}
            portalContainer={portalContainer}
          />
        }
      />

      <SettingRow
        title={t`Text Size`}
        description={t`Adjust the reading size used for editor text.`}
        control={
          <FontSizeControl
            value={settings.fontSize}
            onValueChange={(value) => void applyUpdates({ fontSize: value })}
          />
        }
      />

      {settings.canSetZoom ? (
        <SettingRow
          title={t`Zoom`}
          description={t`Adjust the overall application zoom when supported.`}
          control={
            <ZoomControl
              value={settings.zoom}
              canSetZoom={settings.canSetZoom}
              onValueChange={(value) => void applyUpdates({ zoom: value })}
            />
          }
        />
      ) : null}
    </div>
  );
}

function AdvancedTab({
  loadedProjectPath,
  isCloudLinked,
  syncRemoteStatus,
  authSessionProvider,
  projectsService,
  giteaHostBaseUrl,
  currentLanguageCode,
  settings,
  applyUpdates,
  portalContainer,
  updaterService,
}: {
  loadedProjectPath: string;
  isCloudLinked: boolean;
  syncRemoteStatus: () => Promise<void>;
  authSessionProvider: Pick<AuthSessionProvider, "getCurrentSession">;
  projectsService: CloudProjectsService &
    Pick<ProjectsService, "getRemoteRepo">;
  giteaHostBaseUrl: string | null;
  currentLanguageCode: string | null;
  settings: Settings;
  applyUpdates: (updates: Partial<Settings>) => Promise<void>;
  portalContainer: RefObject<HTMLElement | null>;
  updaterService: IUpdaterService | null;
}) {
  const sessionQuery = useQuery({
    queryKey: ["giteaSession", "settings"],
    queryFn: async () => await authSessionProvider.getCurrentSession(),
  });
  const cloudSessionUsername = sessionQuery.data?.username ?? null;
  const cloudActions = useCloudProjectActions({
    projectsService,
    loadedProjectPath,
    refresh: syncRemoteStatus,
  });
  // Catalog browse + paste-a-link resolve, shared with the cloud popover.
  const picker = useSharedProjectPicker({
    projectsService,
    giteaHostBaseUrl,
    sessionUsername: cloudSessionUsername,
    currentLanguageCode,
  });

  return (
    <div className={styles.section}>
      <UpdateSettingsSection
        updaterService={updaterService}
        portalContainer={portalContainer}
      />
      <DiffViewModeRow
        value={settings.diffViewModeDefault}
        onChange={(value) => applyUpdates({ diffViewModeDefault: value })}
      />
      <EnabledDisabledRow
        title={i18n._(sharedProjectLabels.autoReceiveTitle)}
        description={i18n._(sharedProjectLabels.autoReceiveDescription)}
        checked={settings.autoSyncOnOpen}
        testId={TESTING_IDS.settings.autoSyncOnOpenToggle}
        onChange={(checked) => applyUpdates({ autoSyncOnOpen: checked })}
      />
      <EnabledDisabledRow
        title={i18n._(sharedProjectLabels.autoSendTitle)}
        description={i18n._(sharedProjectLabels.autoSendDescription)}
        checked={settings.autoPushOnSave}
        testId={TESTING_IDS.settings.autoPushOnSaveToggle}
        onChange={(checked) => applyUpdates({ autoPushOnSave: checked })}
      />
      <EnabledDisabledRow
        title={i18n._(sharedProjectLabels.autoAcceptOwnTitle)}
        description={i18n._(sharedProjectLabels.autoAcceptOwnDescription)}
        checked={settings.autoAcceptOwnWorkOnSave}
        testId={TESTING_IDS.settings.autoAcceptOwnWorkOnSaveToggle}
        onChange={(checked) =>
          applyUpdates({ autoAcceptOwnWorkOnSave: checked })
        }
      />
      <EnabledDisabledRow
        title={i18n._(sharedProjectLabels.autoAcceptIncomingTitle)}
        description={i18n._(sharedProjectLabels.autoAcceptIncomingDescription)}
        checked={settings.autoAcceptIncomingWork}
        testId={TESTING_IDS.settings.autoAcceptIncomingWorkToggle}
        onChange={(checked) =>
          applyUpdates({ autoAcceptIncomingWork: checked })
        }
      />

      {!isCloudLinked ? (
        <>
          <CreateCloudProjectRow
            cloudSessionUsername={cloudSessionUsername}
            isCreating={cloudActions.isCreating}
            onCreate={() => cloudActions.create()}
          />
          <AttachCloudProjectRow
            cloudSessionUsername={cloudSessionUsername}
            picker={picker}
            portalContainer={portalContainer}
            isAttaching={cloudActions.isAttaching}
            onAttach={() => cloudActions.attach(picker.resolvedRepo)}
            isSavingOwnCopy={cloudActions.isSavingOwnCopy}
            onSaveOwnCopy={() => cloudActions.saveOwnCopy(picker.resolvedRepo)}
          />
        </>
      ) : null}

      <BuildInfoFooter />
    </div>
  );
}

function DiffViewModeRow(props: {
  value: Settings["diffViewModeDefault"];
  onChange: (value: Settings["diffViewModeDefault"]) => void;
}) {
  const handleChange = (value: string | null) => {
    if (value === "list" || value === "chapter") {
      props.onChange(value);
    }
  };
  return (
    <SettingRow
      title={t`Default review view`}
      description={t`Choose how change review opens by default.`}
      control={
        <div className={styles.fieldControl}>
          <ToggleGroup
            value={props.value}
            onValueChange={handleChange}
            items={[
              { value: "list", label: t`By verse` },
              { value: "chapter", label: t`By chapter` },
            ]}
            className={styles.toggleGroup}
          />
        </div>
      }
    />
  );
}

function EnabledDisabledRow(props: {
  title: string;
  description: string;
  checked: boolean;
  testId?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SettingRow
      title={props.title}
      description={props.description}
      control={
        <div className={styles.rowControlEnd} data-testid={props.testId}>
          <Switch
            checked={props.checked}
            onCheckedChange={(checked) => props.onChange(checked)}
            label={
              <span className={styles.switchLabel}>
                <span className={styles.switchLabelTitle}>
                  {props.checked ? t`Enabled` : t`Disabled`}
                </span>
              </span>
            }
          />
        </div>
      }
    />
  );
}

function CreateCloudProjectRow(props: {
  cloudSessionUsername: string | null;
  isCreating: boolean;
  onCreate: () => void;
}) {
  return (
    <SettingRow
      title={t`Create a shared project`}
      description={t`Save this project as a new shared project.`}
      control={
        <div className={styles.rowControlEnd}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid={TESTING_IDS.settings.createRemoteProjectButton}
            disabled={!props.cloudSessionUsername || props.isCreating}
            onClick={props.onCreate}
          >
            {props.isCreating
              ? t`Creating...`
              : t`Save as a new shared project`}
          </Button>
        </div>
      }
    />
  );
}

function catalogRepoLabel(repo: ConsolidatedRepo) {
  return repo.title?.trim() ? repo.title : repo.repo_name;
}

function catalogRepoKey(repo: ConsolidatedRepo) {
  return `${repo.username}/${repo.repo_name}`;
}

function AttachCloudProjectRow(props: {
  cloudSessionUsername: string | null;
  picker: SharedProjectPicker;
  portalContainer: RefObject<HTMLElement | null>;
  isAttaching: boolean;
  onAttach: () => void;
  isSavingOwnCopy: boolean;
  onSaveOwnCopy: () => void;
}) {
  const catalogError = props.picker.isCatalogError
    ? (props.picker.catalogErrorMessage ?? t`Couldn't load your projects`)
    : null;
  return (
    <SettingRow
      title={t`Connect to a shared project`}
      description={t`Connect this project to a shared project you can edit.`}
      control={
        <div className={styles.fieldControl}>
          <CloudProjectCombobox
            picker={props.picker}
            catalogError={catalogError}
            portalContainer={props.portalContainer}
            cloudSessionUsername={props.cloudSessionUsername}
            isAttaching={props.isAttaching}
            onAttach={props.onAttach}
            isSavingOwnCopy={props.isSavingOwnCopy}
            onSaveOwnCopy={props.onSaveOwnCopy}
          />
          {props.picker.linkTargetLabel ? null : (
            <AttachResolveStatus
              resolveState={props.picker.resolveState}
              targetLabel={
                props.picker.selectedRepo
                  ? catalogRepoKey(props.picker.selectedRepo)
                  : null
              }
              canRunActions={Boolean(props.cloudSessionUsername)}
              isAttaching={props.isAttaching}
              isSavingOwnCopy={props.isSavingOwnCopy}
              onConnect={props.onAttach}
              onSaveOwnCopy={props.onSaveOwnCopy}
            />
          )}
        </div>
      }
    />
  );
}

function CloudProjectCombobox(props: {
  picker: SharedProjectPicker;
  catalogError: string | null;
  portalContainer: RefObject<HTMLElement | null>;
  cloudSessionUsername: string | null;
  isAttaching: boolean;
  onAttach: () => void;
  isSavingOwnCopy: boolean;
  onSaveOwnCopy: () => void;
}) {
  const { picker } = props;
  const selectedKey = picker.selectedRepo
    ? catalogRepoKey(picker.selectedRepo)
    : null;
  return (
    <div data-testid={TESTING_IDS.settings.attachRemoteProjectSelect}>
      <Combobox.Root<ConsolidatedRepo>
        items={picker.catalogRepos}
        value={picker.selectedRepo}
        inputValue={picker.catalogQuery}
        onInputValueChange={picker.setCatalogQuery}
        onValueChange={(value) => picker.setSelectedRepo(value ?? null)}
        itemToStringLabel={catalogRepoLabel}
        itemToStringValue={catalogRepoKey}
      >
        <Combobox.Trigger
          className={styles.cloudProjectComboboxTrigger}
          aria-label={t`Select a shared project`}
        >
          <span className={styles.cloudProjectComboboxValue}>
            {picker.selectedRepo
              ? catalogRepoLabel(picker.selectedRepo)
              : t`Select a shared project`}
          </span>
          <span
            className={styles.cloudProjectComboboxChevron}
            aria-hidden="true"
          >
            ⌄
          </span>
        </Combobox.Trigger>
        <Combobox.Portal container={props.portalContainer}>
          <Combobox.Positioner sideOffset={8} align="start">
            <Combobox.Popup className={styles.cloudProjectComboboxPopup}>
              <div className={styles.cloudProjectComboboxHeader}>
                <Combobox.Input
                  className={styles.cloudProjectComboboxInput}
                  aria-label={t`Search projects or paste a project link`}
                  placeholder={t`Search or paste a project link`}
                  autoFocus
                />
              </div>
              <ScrollArea.Root
                className={styles.cloudProjectComboboxScrollArea}
              >
                <ScrollArea.Viewport
                  className={styles.cloudProjectComboboxScrollViewport}
                >
                  <Combobox.List className={styles.cloudProjectComboboxList}>
                    {picker.catalogRepos.map((repo) => (
                      <Combobox.Item
                        key={catalogRepoKey(repo)}
                        value={repo}
                        className={styles.cloudProjectComboboxItem}
                      >
                        <span
                          className={styles.cloudProjectComboboxItemIndicator}
                          aria-hidden="true"
                        >
                          {selectedKey === catalogRepoKey(repo) ? (
                            <Check size={14} />
                          ) : null}
                        </span>
                        <span>
                          {catalogRepoLabel(repo)}
                          <span
                            className={styles.cloudProjectComboboxItemOwner}
                          >
                            {" "}
                            · {repo.username}
                          </span>
                        </span>
                      </Combobox.Item>
                    ))}
                  </Combobox.List>
                  <Combobox.Empty className={styles.cloudProjectComboboxEmpty}>
                    {/* Link-mode status + action live in the
                                            footer below, not here. */}
                    {picker.linkTargetLabel ? null : picker.isCatalogLoading ? (
                      <Trans>Loading your projects…</Trans>
                    ) : props.catalogError ? (
                      props.catalogError
                    ) : (
                      <Trans>No shared projects found.</Trans>
                    )}
                  </Combobox.Empty>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar orientation="vertical">
                  <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
              </ScrollArea.Root>
              {picker.linkTargetLabel ? (
                <div className={styles.cloudProjectComboboxLinkFooter}>
                  <AttachResolveStatus
                    resolveState={picker.resolveState}
                    targetLabel={picker.linkTargetLabel}
                    canRunActions={Boolean(props.cloudSessionUsername)}
                    isAttaching={props.isAttaching}
                    isSavingOwnCopy={props.isSavingOwnCopy}
                    onConnect={props.onAttach}
                    onSaveOwnCopy={props.onSaveOwnCopy}
                  />
                </div>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}

function BuildInfoFooter() {
  const versionLabel = import.meta.env.DEV
    ? "local"
    : import.meta.env.VITE_VERSION_TAG || "";
  const showSha = !import.meta.env.DEV && import.meta.env.VITE_GITHUB_SHA;
  return (
    <div className={styles.buildInfo}>
      <div className={styles.buildInfoRow}>
        <span className={styles.buildInfoLabel}>
          <Trans>Version</Trans>:
        </span>
        <span className={styles.buildInfoValue}>{versionLabel}</span>
      </div>
      {showSha ? (
        <div className={styles.buildInfoRow}>
          <span className={styles.buildInfoLabel}>
            <Trans>SHA</Trans>:
          </span>
          <span className={styles.buildInfoValue}>
            {import.meta.env.VITE_GITHUB_SHA}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className={styles.sectionRow}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{title}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <div className={styles.rowControl}>{control}</div>
    </div>
  );
}
