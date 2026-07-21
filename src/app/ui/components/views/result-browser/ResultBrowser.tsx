import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

import { ResultBrowserRow } from "./ResultBrowserRow.tsx";
import type { ResultRow } from "./resultRow.ts";

/**
 * Neutral, virtualized list of prepared verse-result rows. It owns only the
 * scroll container and virtualization; callers prepare `rows` and decide when to
 * render loading / empty / error content instead of this list. `containerData`
 * lets a caller keep its own hooks on the scroll element (Find sets `data-js`
 * so its scroll-to-top reset still finds this container).
 */
export function ResultBrowser({
  rows,
  containerData,
  containerClassName,
}: {
  rows: ResultRow[];
  containerData?: Record<string, string | number>;
  containerClassName?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className={
        containerClassName
          ? `${styles.searchResultsContainer} ${containerClassName}`
          : styles.searchResultsContainer
      }
      {...containerData}
    >
      <div
        className={styles.searchResultsInner}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={row.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={styles.searchResultRow}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <ResultBrowserRow row={row} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
