import { Trans, useLingui } from "@lingui/react/macro";
import { useRef } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

import { SearchControls } from "./SearchControls.tsx";
import { SearchResults } from "./SearchResults.tsx";

interface SearchPanelProps {
  onClose?: () => void;
}

export function SearchPanel({ onClose }: SearchPanelProps = {}) {
  const { search } = useWorkspaceContext();
  const { t } = useLingui();
  const overlayPortalRef = useRef<HTMLDivElement | null>(null);

  if (!search.isSearchPaneOpen) return null;

  const handleClose = () => {
    search.setIsSearchPaneOpen(false);
    onClose?.();
  };

  return (
    <aside
      ref={overlayPortalRef}
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
            onClick={handleClose}
            aria-label={t`Close search`}
          >
            <Trans>Close</Trans>
          </button>
        </div>

        <SearchControls portalContainer={overlayPortalRef} />
      </div>

      <SearchResults />
    </aside>
  );
}
