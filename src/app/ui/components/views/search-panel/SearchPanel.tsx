import { Trans, useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";
import { SearchControls } from "./SearchControls.tsx";
import { SearchResults } from "./SearchResults.tsx";

export function SearchPanel() {
    const { search } = useWorkspaceContext();
    const { t } = useLingui();

    if (!search.isSearchPaneOpen) return null;

    return (
        <aside
            className={styles.searchPanel}
            data-testid={TESTING_IDS.searchResultsContainer}
        >
            <div className={styles.searchPanelHeader}>
                <div className={styles.searchPanelHeaderTop}>
                    <span className={styles.searchPanelTitle}>
                        <Trans>Search</Trans>
                    </span>
                    <button
                        type="button"
                        className={styles.searchPanelClose}
                        onClick={() => search.setIsSearchPaneOpen(false)}
                        aria-label={t`Close search`}
                    >
                        <X size={16} />
                    </button>
                </div>

                <SearchControls />
            </div>

            <SearchResults />
        </aside>
    );
}
