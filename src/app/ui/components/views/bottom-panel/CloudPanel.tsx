import { Cloud } from "lucide-react";
import type { ReactNode } from "react";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

export function CloudPanelContent() {
    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.bottomPanelList}>
                <BottomPanelGroup
                    title="Sync activity"
                    location="Remote"
                    count="2"
                    items={[
                        {
                            icon: <Cloud size={14} />,
                            tone: "muted",
                            message: "Push completed for origin/main",
                            meta: "12 seconds ago",
                        },
                        {
                            icon: <Cloud size={14} />,
                            tone: "accent",
                            message: "Remote has one newer commit available",
                            meta: "Fetch to inspect changes",
                        },
                    ]}
                />
            </div>
        </div>
    );
}

function BottomPanelGroup(props: {
    title: string;
    location: string;
    count: string;
    items: Array<{
        icon: ReactNode;
        tone: "accent" | "muted";
        message: string;
        meta: string;
    }>;
}) {
    const rows = props.items.map((item, index) => (
        <BottomPanelRow
            key={`${props.title}-${index}`}
            icon={item.icon}
            tone={item.tone}
            message={item.message}
            meta={item.meta}
        />
    ));

    return (
        <section className={styles.bottomPanelGroup}>
            <header className={styles.bottomPanelGroupHeader}>
                <span className={styles.bottomPanelGroupChevron}>
                    <ChevronDown size={14} />
                </span>
                <span className={styles.bottomPanelGroupTitle}>
                    {props.title}
                </span>
                <span className={styles.bottomPanelGroupLocation}>
                    {props.location}
                </span>
                <span className={styles.bottomPanelGroupCount}>
                    {props.count}
                </span>
            </header>
            <div>{rows}</div>
        </section>
    );
}

function BottomPanelRow(props: {
    icon: ReactNode;
    tone: "accent" | "muted";
    message: string;
    meta: string;
}) {
    const messageClassName =
        props.tone === "accent"
            ? styles.bottomPanelRowMessageAccent
            : styles.bottomPanelRowMessage;

    return (
        <div className={styles.bottomPanelRow}>
            <div className={styles.bottomPanelRowIcon}>{props.icon}</div>
            <div className={messageClassName}>{props.message}</div>
            <div className={styles.bottomPanelRowMeta}>{props.meta}</div>
        </div>
    );
}

// ChevronDown icon component for header
function ChevronDown(props: { size: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={props.size}
            height={props.size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}
