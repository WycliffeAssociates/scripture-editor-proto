import {
    ClipboardPaste,
    Copy,
    Redo2,
    Save,
    Scissors,
    Undo2,
} from "lucide-react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "./editorToolbar.css.ts";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

export function EditorToolbar(props: {
    rightSlot?: React.ReactNode;
    statusText?: string;
}) {
    return (
        <div className={styles.root}>
            <div className={joinClassNames(styles.cluster, styles.leftCluster)}>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.iconButton}
                    aria-label="Cut"
                >
                    <Scissors size={16} />
                </Button>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.iconButton}
                    aria-label="Copy"
                >
                    <Copy size={16} />
                </Button>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.iconButton}
                    aria-label="Paste"
                >
                    <ClipboardPaste size={16} />
                </Button>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.iconButton}
                    aria-label="Save"
                >
                    <Save size={16} />
                </Button>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.iconButton}
                    aria-label="Undo"
                >
                    <Undo2 size={16} />
                </Button>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.iconButton}
                    aria-label="Redo"
                >
                    <Redo2 size={16} />
                </Button>
            </div>

            <div
                className={joinClassNames(styles.cluster, styles.rightCluster)}
            >
                {props.statusText ? (
                    <span className={styles.statusText}>
                        {props.statusText}
                    </span>
                ) : null}
                {props.rightSlot}
            </div>
        </div>
    );
}
