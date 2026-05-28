import { Trans } from "@lingui/react/macro";
import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import ProjectRow from "@/app/ui/components/blocks/ProjectRow.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import * as styles from "@/app/ui/styles/modules/indexPage.css.ts";

/**
 * Home/library landing route for editable scripture items.
 *
 * The broader index/catalog can contain more item types, but this route presents
 * the current editable-project slice that leads into the main scripture workspace.
 */
export const Route = createFileRoute("/")({
    component: IndexRoute,
});

export function IndexRoute() {
    const router = useRouter();
    const { projects } = useLoaderData({ from: "__root__" });
    const { settingsManager } = router.options.context;
    const [currentLanguage, setCurrentLanguage] = useState<string | null>(() =>
        settingsManager.get("appLanguage"),
    );
    const byLanguage = projects.reduce(
        (acc, project) => {
            const languageName = project.languageName;
            if (!acc[languageName]) {
                acc[languageName] = [];
            }
            acc[languageName].push(project);
            return acc;
        },
        {} as Record<string, typeof projects>,
    );
    return (
        <main className={styles.page}>
            <section className={styles.shell}>
                <header className={styles.header}>
                    <div className={styles.headerCopy}>
                        <h1 className={styles.title}>
                            <Trans>Current Projects</Trans>
                        </h1>
                        <p className={styles.description}>
                            <Trans>
                                Open an existing project, or create a new one.
                            </Trans>
                        </p>
                    </div>
                    <div className={styles.headerActions}>
                        <Link to="/create" className={styles.newProjectLink}>
                            <Trans>New Project</Trans>
                        </Link>
                        <div className={styles.languagePicker}>
                            <LanguageSelector
                                onChange={async (val) => {
                                    if (!val) return;
                                    settingsManager.set("appLanguage", val);
                                    await loadLocale(val);
                                    settingsManager.applySettings?.();
                                    setCurrentLanguage(val);
                                }}
                                value={currentLanguage}
                            />
                        </div>
                    </div>
                </header>

                {projects.length === 0 ? (
                    <section className={styles.emptyState}>
                        <p className={styles.emptyText}>
                            <Trans>No projects yet</Trans>
                        </p>
                        <div className={styles.emptyActions}>
                            <Link
                                to="/create"
                                className={styles.newProjectLink}
                            >
                                <Trans>Create your first project</Trans>
                            </Link>
                        </div>
                    </section>
                ) : (
                    <section className={styles.groups}>
                        {Object.entries(byLanguage)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([languageName, projectsForLanguage]) => (
                                <section
                                    key={languageName}
                                    className={styles.group}
                                >
                                    <h2 className={styles.groupTitle}>
                                        {languageName}
                                    </h2>
                                    <div className={styles.groupRows}>
                                        {projectsForLanguage.map((project) => (
                                            <ProjectRow
                                                key={project.projectPath}
                                                project={project}
                                                settingsManager={
                                                    settingsManager
                                                }
                                                invalidateRouterAndReload={() => {
                                                    void router.invalidate();
                                                }}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                    </section>
                )}
            </section>
        </main>
    );
}
