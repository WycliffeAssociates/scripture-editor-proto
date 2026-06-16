import { Trans, useLingui } from "@lingui/react/macro";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useRef } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/useWorkspaceMediaQuery.ts";
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
  const { isSm } = useWorkspaceMediaQuery();
  const overlayPortalRef = useRef<HTMLDivElement | null>(null);

  if (!search.isSearchPaneOpen) return null;

  const handleClose = () => {
    search.setIsSearchPaneOpen(false);
    onClose?.();
  };

  // The dock toggle only makes sense on desktop, where find can sit beside the
  // editor; small screens always take over the full surface.
  const showDockToggle = !isSm;
  const dockLabel = search.isSearchDocked
    ? t`Hide editor`
    : t`Show editor beside find`;

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
          <div className={styles.searchPanelHeaderActions}>
            {showDockToggle ? (
              <button
                type="button"
                className={styles.searchPanelDockToggle}
                onClick={search.toggleSearchDock}
                aria-label={dockLabel}
                title={dockLabel}
                data-testid={TESTING_IDS.searchDockToggle}
              >
                {search.isSearchDocked ? (
                  <PanelRightClose size={16} />
                ) : (
                  <PanelRightOpen size={16} />
                )}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.searchPanelClose}
              onClick={handleClose}
              aria-label={t`Close search`}
            >
              <Trans>Close</Trans>
            </button>
          </div>
        </div>

        <SearchControls />
      </div>

      <SearchResults />
    </aside>
  );
}
