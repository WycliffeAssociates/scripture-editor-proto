import { Settings2 } from "lucide-react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { BookChapterPickerSidebar } from "@/app/ui/components/blocks/BookChapterPickerSidebar/BookChapterPickerSidebar.tsx";
import { ProjectSwitcher } from "@/app/ui/components/blocks/ProjectSwitcher/index.ts";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

interface DesktopSidebarProps {
  openProjectsPane: () => void;
  openSettingsPane: () => void;
}

export function DesktopSidebar(props: DesktopSidebarProps) {
  return (
    <aside className={styles.desktopSidebar}>
      <div className={styles.sidebarTop}>
        <ProjectSwitcher openProjectsPane={props.openProjectsPane} />
      </div>

      <div className={styles.sidebarBooks}>
        <BookChapterPickerSidebar />
      </div>

      <div className={styles.sidebarBottom}>
        <button
          type="button"
          className={styles.sidebarAction}
          onClick={props.openSettingsPane}
          aria-label="Open settings pane"
          data-testid={TESTING_IDS.settings.drawerOpenButton}
        >
          <span className={styles.sidebarActionIcon}>
            <Settings2 size={16} />
          </span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
