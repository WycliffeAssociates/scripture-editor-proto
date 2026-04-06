import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Languages, MoonStar, Save, SunMedium } from "lucide-react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { GET_LOCALES, type Settings } from "@/app/data/settings.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { ShowErrorNotification } from "@/app/ui/components/primitives/Notifications.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import EditorModeToggle from "./EditorModeToggle.tsx";
import FontSizeControl from "./FontSizeControl.tsx";
import * as styles from "./settings.css.ts";
import ZoomControl from "./ZoomControl.tsx";

type SettingsTab = "app-appearance" | "reference-panel" | "advanced";

interface SettingsPanelProps {
    onClose?: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
    const { actions, project } = useWorkspaceContext();
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
            });
        } catch (error) {
            ShowErrorNotification({
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
                            <div className={styles.title}>{t`Settings`}</div>
                        </div>
                    </div>
                </div>

                <BaseTabs.Root
                    value={activeTab}
                    onValueChange={(value) =>
                        setActiveTab(value as SettingsTab)
                    }
                    className={styles.tabsRoot}
                >
                    <div className={styles.tabsListOuter}>
                        <div className={styles.contentInner}>
                            <BaseTabs.List className={styles.tabsList}>
                                <BaseTabs.Tab
                                    value="app-appearance"
                                    className={styles.tabsTrigger}
                                >
                                    {t`App Appearance`}
                                </BaseTabs.Tab>
                                <BaseTabs.Tab
                                    value="reference-panel"
                                    className={styles.tabsTrigger}
                                >
                                    {t`Reference Panel`}
                                </BaseTabs.Tab>
                                <BaseTabs.Tab
                                    value="advanced"
                                    className={styles.tabsTrigger}
                                >
                                    {t`Advanced`}
                                </BaseTabs.Tab>
                            </BaseTabs.List>
                        </div>
                    </div>

                    <BaseTabs.Panel
                        value="app-appearance"
                        className={styles.tabsPanel}
                    >
                        <div className={styles.tabsPanelInner}>
                            <AppAppearanceTab
                                settings={project.appSettings}
                                applyUpdates={handleSettingsChange}
                                portalContainer={overlayPortalRef}
                            />
                        </div>
                    </BaseTabs.Panel>

                    <BaseTabs.Panel
                        value="reference-panel"
                        className={styles.tabsPanel}
                    >
                        <div className={styles.tabsPanelInner}>
                            <ReferencePanelTab />
                        </div>
                    </BaseTabs.Panel>

                    <BaseTabs.Panel
                        value="advanced"
                        className={styles.tabsPanel}
                    >
                        <div className={styles.tabsPanelInner}>
                            <AdvancedTab
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
                            {t`Save and Close`}
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
                            {t`Close without Saving`}
                        </Button>
                    </div>
                </div>
            </div>
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
    const localeItems = Object.entries(GET_LOCALES()).map(
        ([value, locale]) => ({
            value,
            label: i18n._(locale.nativeName),
        }),
    );

    return (
        <div className={styles.section}>
            <SettingRow
                title={t`Interface Language`}
                description={t`Choose the display language for Dovetail.`}
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
                                    appLanguage:
                                        value as Settings["appLanguage"],
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
                        onValueChange={(value) =>
                            void applyUpdates({ editorMode: value })
                        }
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
                        onValueChange={(value) =>
                            void applyUpdates({ fontSize: value })
                        }
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
                            onValueChange={(value) =>
                                void applyUpdates({ zoom: value })
                            }
                        />
                    }
                />
            ) : null}
        </div>
    );
}

function ReferencePanelTab() {
    return (
        <div className={styles.placeholder}>
            <div className={styles.rowTitle}>{t`Reference panel settings`}</div>
            <div className={styles.rowDescription}>
                {t`This tab shell is in place. The remaining reference-specific persisted settings still need to be defined before we wire real controls into it.`}
            </div>
        </div>
    );
}

function AdvancedTab({
    settings,
    applyUpdates,
}: {
    settings: Settings;
    applyUpdates: (updates: Partial<Settings>) => Promise<void>;
}) {
    return (
        <div className={styles.section}>
            <SettingRow
                title={t`Auto Sync on Open`}
                description={t`Check for cloud updates automatically when opening a linked project.`}
                control={
                    <div
                        className={styles.rowControlEnd}
                        data-testid={TESTING_IDS.settings.autoSyncOnOpenToggle}
                    >
                        <Switch
                            checked={settings.autoSyncOnOpen}
                            onCheckedChange={(checked) =>
                                void applyUpdates({ autoSyncOnOpen: checked })
                            }
                            label={
                                <span className={styles.switchLabel}>
                                    <span className={styles.switchLabelTitle}>
                                        {settings.autoSyncOnOpen
                                            ? t`Enabled`
                                            : t`Disabled`}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Auto Publish on Save`}
                description={t`Publish local saves automatically for linked cloud projects.`}
                control={
                    <div
                        className={styles.rowControlEnd}
                        data-testid={TESTING_IDS.settings.autoPushOnSaveToggle}
                    >
                        <Switch
                            checked={settings.autoPushOnSave}
                            onCheckedChange={(checked) =>
                                void applyUpdates({ autoPushOnSave: checked })
                            }
                            label={
                                <span className={styles.switchLabel}>
                                    <span className={styles.switchLabelTitle}>
                                        {settings.autoPushOnSave
                                            ? t`Enabled`
                                            : t`Disabled`}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                }
            />
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
