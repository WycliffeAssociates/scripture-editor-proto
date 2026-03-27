import { useLingui } from "@lingui/react/macro";
import { Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { InfoIcon } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { AppDrawer } from "@/app/ui/components/blocks/AppDrawer.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { SearchPanel } from "@/app/ui/components/blocks/Search.tsx";
import { Toolbar } from "@/app/ui/components/blocks/Toolbar.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import type { ReferenceItemHook } from "@/app/ui/hooks/useReferenceItem.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

/**
 * Main workspace route view.
 *
 * By the time this component renders, the route has already loaded an editable
 * scripture workspace and the workspace provider has assembled the hooks that sit
 * on top of it. This component is responsible for layout only: toolbar, search
 * panel, main editor, and optional reference pane.
 */
export function ProjectView() {
    const { referenceResource, search } = useWorkspaceContext();
    const [opened, { open, close }] = useDisclosure(false);
    const { isSm, mobileTab, setMobileTab } = useWorkspaceMediaQuery();
    const hasReferenceResource = Boolean(
        referenceResource.activeReferenceResourcePath,
    );

    const desktopColumns = (() => {
        if (search.isSearchPaneOpen && hasReferenceResource)
            return "minmax(20rem, 24rem) minmax(0, 1fr) minmax(20rem, 28rem)";
        if (search.isSearchPaneOpen && !hasReferenceResource)
            return "minmax(20rem, 24rem) minmax(0, 1fr)";
        if (!search.isSearchPaneOpen && hasReferenceResource)
            return "minmax(0, 1fr) minmax(20rem, 28rem)";
        return "1fr";
    })();

    return (
        <div
            className={
                referenceResource.activeReferenceResourcePath
                    ? styles.appLayoutWithReference
                    : styles.appLayout
            }
        >
            <TopToolbar isSmall={isSm} openDrawer={open} />

            <MobileReferenceTabs
                isSmall={isSm}
                referenceResource={referenceResource}
                mobileTab={mobileTab}
                setMobileTab={setMobileTab}
            />

            <div
                className={
                    isSm
                        ? styles.mobileEditorsContainer
                        : styles.desktopContentGrid
                }
                style={
                    isSm ? undefined : { gridTemplateColumns: desktopColumns }
                }
            >
                <SearchPanel />

                <div
                    className={
                        isSm
                            ? styles.editorMainSmall
                            : styles.editorWrapperDesktop
                    }
                    style={
                        isSm && hasReferenceResource
                            ? {
                                  display:
                                      mobileTab === "main" ? "block" : "none",
                              }
                            : undefined
                    }
                >
                    <div className={styles.editor}>
                        <MainEditor />
                    </div>
                </div>

                {hasReferenceResource && (
                    <div
                        className={
                            isSm
                                ? styles.editorReferenceSmall
                                : styles.referenceColumn
                        }
                        style={
                            isSm
                                ? {
                                      display:
                                          mobileTab === "ref"
                                              ? "block"
                                              : "none",
                                  }
                                : undefined
                        }
                    >
                        <ReferenceEditor />
                    </div>
                )}
            </div>

            <AppDrawer opened={opened} close={close} />
        </div>
    );
}

/**
 * Toolbar row plus chapter-navigation chrome.
 *
 * Split out so the main layout stays focused on column composition while this
 * helper owns the responsive toolbar/navigation arrangement.
 */
function TopToolbar(props: { isSmall: boolean; openDrawer: () => void }) {
    return (
        <nav className={styles.navRibbon}>
            <Toolbar openDrawer={props.openDrawer} />

            {!props.isSmall && (
                <div className={styles.chapterNavRow}>
                    <div className={styles.chapterNavLeft}>
                        <PrevButton />
                    </div>
                    <LocationIndicator />
                    <div className={styles.chapterNavRight}>
                        <NextButton />
                    </div>
                </div>
            )}

            {props.isSmall && (
                <div className={styles.mobileRibbon}>
                    <div className={styles.mobileRibbonLeft}>
                        <PrevButton />
                    </div>

                    <LocationIndicator isCompact />

                    <div className={styles.mobileRibbonRight}>
                        <NextButton />
                    </div>
                </div>
            )}
        </nav>
    );
}

/**
 * Current location pill for the loaded scripture workspace.
 */
function LocationIndicator(props: { isCompact?: boolean }) {
    const { project, bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const { t } = useLingui();

    const chapter =
        project.pickedChapter?.chapterNumber ?? project.currentChapter ?? 0;

    const bookTitle = bookCodeToProjectLocalizedTitle({
        bookCode: project.pickedFile.bookCode,
    });

    const chapterLabel = chapter === 0 ? t`Introduction` : t`${chapter}`;

    return (
        <div className={styles.locationPill}>
            <div>
                <div className={styles.locationPrimary}>
                    {props.isCompact ? project.pickedFile.bookCode : bookTitle}
                    &nbsp;
                    <span>
                        {props.isCompact
                            ? chapter === 0
                                ? t`Intro`
                                : `${chapter}`
                            : chapterLabel}
                    </span>
                </div>
            </div>
        </div>
    );
}

/**
 * Small-screen tab switcher for toggling between editable and reference panes.
 *
 * Desktop can show both columns at once. On small screens we keep both mounted
 * but switch visibility so editor and reference state are preserved.
 */
function MobileReferenceTabs(props: {
    isSmall: boolean;
    referenceResource: ReferenceItemHook;
    mobileTab: "main" | "ref";
    setMobileTab: (tab: "main" | "ref") => void;
}) {
    return (
        props.isSmall &&
        props.referenceResource.activeReferenceResourcePath && (
            <div className={styles.mobileTabsBar}>
                <button
                    type="button"
                    data-testid={TESTING_IDS.mobile.mainEditorTab}
                    className={`${styles.mobileTabButton} ${
                        props.mobileTab === "main"
                            ? styles.mobileTabButtonActive
                            : ""
                    }`}
                    onClick={() => props.setMobileTab("main")}
                >
                    Editor
                </button>
                <button
                    type="button"
                    data-testid={TESTING_IDS.mobile.referenceEditorTab}
                    className={`${styles.mobileTabButton} ${
                        props.mobileTab === "ref"
                            ? styles.mobileTabButtonActive
                            : ""
                    }`}
                    onClick={() => props.setMobileTab("ref")}
                >
                    Reference
                </button>
            </div>
        )
    );
}

function PrevButton() {
    const { actions, search } = useWorkspaceContext();
    const { t } = useLingui();

    if (!actions.prevChapter.hasPrev) {
        return (
            <span
                data-testid={TESTING_IDS.navigation.prevChapterButtonHidden}
                className={`${styles.editorNavButton} ${styles.editorNavButtonHidden}`}
            />
        );
    }

    const isIntroduction =
        actions.prevChapter.display?.includes(t`Introduction`) || false;

    return (
        <button
            type="button"
            data-testid={TESTING_IDS.navigation.prevChapterButton}
            disabled={!actions.prevChapter.hasPrev}
            onClick={() => {
                actions.prevChapter.go();
                search.rerunForCurrentChapter();
            }}
            className={`${styles.editorNavButton}`}
        >
            {isIntroduction ? (
                <Tooltip label={t`This is introductory material for this book`}>
                    <InfoIcon size={16} />
                </Tooltip>
            ) : (
                actions.prevChapter.display || ""
            )}
        </button>
    );
}
function NextButton() {
    const { actions, search } = useWorkspaceContext();
    const { t } = useLingui();

    if (!actions.nextChapter.hasNext) {
        return (
            <span
                data-testid={TESTING_IDS.navigation.nextChapterButtonHidden}
                className={`${styles.editorNavButton} ${styles.editorNavButtonHidden}`}
            />
        );
    }
    const isIntroduction =
        actions.nextChapter.display?.includes(t`Introduction`) || false;

    return (
        <button
            type="button"
            data-testid={TESTING_IDS.navigation.nextChapterButton}
            disabled={!actions.nextChapter.hasNext}
            onClick={() => {
                actions.nextChapter.go();
                search.rerunForCurrentChapter();
            }}
            className={`${styles.editorNavButton}`}
        >
            {isIntroduction ? (
                <Tooltip label={t`This is introductory material for this book`}>
                    <InfoIcon size={16} />
                </Tooltip>
            ) : (
                actions.nextChapter.display || ""
            )}
        </button>
    );
}
