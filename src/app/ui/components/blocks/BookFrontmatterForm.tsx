import { Menu } from "@base-ui/react/menu";
import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import { Plus, Trash2 } from "lucide-react";
import {
    type MouseEvent as ReactMouseEvent,
    type SyntheticEvent,
    useMemo,
} from "react";
import {
    type BookFrontmatterEntry,
    createBookFrontmatterEntry,
    parseBookFrontmatterEntries,
    serializeBookFrontmatterEntries,
} from "@/app/domain/editor/utils/bookFrontmatterEntries.ts";
import { TextInput } from "@/app/ui/components/primitives/Input/Input.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import {
    getLocalizedUsfmMarkerDescription,
    getLocalizedUsfmMarkerLabel,
} from "@/app/ui/i18n/usfmMarkerLocalization.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import * as styles from "./bookFrontmatterForm.css.ts";

const IDE_OPTIONS = [
    "UTF-8",
    "UTF-16LE",
    "UTF-16BE",
    "UTF-32LE",
    "UTF-32BE",
    "CP-1251",
    "CP-1252",
    "Custom",
].map((value) => ({ value, label: value }));

const ADDABLE_MARKERS = ["id", "h", "toc1", "toc2", "toc3", "mt"] as const;

type AddableMarker = (typeof ADDABLE_MARKERS)[number];

type BookFrontmatterFormProps = {
    id: string;
    direction: LanguageDirection;
    tokens: SerializedLexicalNode[];
    onChange: (tokens: SerializedLexicalNode[]) => void;
};

/**
 * Structured regular-mode editing surface for chapter-0 frontmatter. This keeps
 * common book metadata approachable without changing the token pipeline used by
 * save, lint, diff, and history.
 */
export function BookFrontmatterForm(props: BookFrontmatterFormProps) {
    const { t } = useLingui();
    const entries = useMemo(
        () => parseBookFrontmatterEntries(props.tokens),
        [props.tokens],
    );
    const firstSid = entries[0]?.sid ?? "";
    const hasId = entries.some((entry) => entry.marker === "id");

    function commit(nextEntries: BookFrontmatterEntry[]) {
        props.onChange(serializeBookFrontmatterEntries(nextEntries));
    }

    function replaceEntry(
        targetId: string,
        updater: (entry: BookFrontmatterEntry) => BookFrontmatterEntry,
    ) {
        commit(
            entries.map((entry) =>
                entry.id === targetId ? updater(entry) : entry,
            ),
        );
    }

    function deleteEntry(targetId: string) {
        commit(entries.filter((entry) => entry.id !== targetId));
    }

    function addEntry(marker: AddableMarker, insertIndex: number) {
        const nextEntry = createBookFrontmatterEntry({
            marker,
            sid: firstSid,
        });

        if (marker === "id") {
            commit([nextEntry, ...entries]);
            return;
        }

        const nextEntries = [...entries];
        nextEntries.splice(insertIndex, 0, nextEntry);
        commit(nextEntries);
    }

    function stopOuterEditorEvent(event: SyntheticEvent) {
        event.stopPropagation();
    }

    function handleControlPress(
        event: ReactMouseEvent<HTMLElement>,
        action: () => void,
    ) {
        event.preventDefault();
        event.stopPropagation();
        action();
    }

    return (
        <section
            className={styles.shell}
            dir={props.direction}
            contentEditable={false}
            onKeyDownCapture={stopOuterEditorEvent}
            onBeforeInputCapture={stopOuterEditorEvent}
            onInputCapture={stopOuterEditorEvent}
            onPasteCapture={stopOuterEditorEvent}
            onCompositionStartCapture={stopOuterEditorEvent}
            onCompositionUpdateCapture={stopOuterEditorEvent}
            onCompositionEndCapture={stopOuterEditorEvent}
        >
            <div className={styles.header}>
                <div className={styles.titleBlock}>
                    <div className={styles.title}>{t`Book frontmatter`}</div>
                    <div
                        className={styles.subtitle}
                    >{t`Chapter 0 metadata and introductory markers`}</div>
                </div>
            </div>

            <div className={styles.cards}>
                <InsertSlot
                    insertIndex={0}
                    hasId={hasId}
                    onInsert={(marker) => addEntry(marker, 0)}
                    onControlPress={handleControlPress}
                />
                {entries.map((entry, index) => (
                    <div key={entry.id}>
                        <FrontmatterCard
                            entry={entry}
                            onDelete={() => deleteEntry(entry.id)}
                            onChange={(nextEntry) =>
                                replaceEntry(entry.id, () => nextEntry)
                            }
                            onControlPress={handleControlPress}
                        />
                        <InsertSlot
                            insertIndex={index + 1}
                            hasId={hasId}
                            onInsert={(marker) => addEntry(marker, index + 1)}
                            onControlPress={handleControlPress}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}

function InsertSlot(props: {
    insertIndex: number;
    hasId: boolean;
    onInsert: (marker: AddableMarker) => void;
    onControlPress: (
        event: ReactMouseEvent<HTMLElement>,
        action: () => void,
    ) => void;
}) {
    const { t } = useLingui();

    return (
        <div className={styles.insertSlot}>
            <div className={styles.insertRule} />
            <Menu.Root>
                <Menu.Trigger
                    className={styles.addButton}
                    onMouseDown={(event) => {
                        event.stopPropagation();
                    }}
                    aria-label={t`Insert marker here`}
                    title={t`Insert marker here`}
                >
                    <Plus size={14} />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner
                        side="bottom"
                        align="center"
                        sideOffset={4}
                        className={styles.insertMenuPositioner}
                    >
                        <Menu.Popup className={styles.insertMenuPopup}>
                            <div className={styles.insertMenuList}>
                                {ADDABLE_MARKERS.map((marker) => {
                                    if (marker === "id" && props.hasId)
                                        return null;

                                    return (
                                        <Menu.Item
                                            key={`${props.insertIndex}-${marker}`}
                                            className={styles.insertMenuItem}
                                            onClick={() =>
                                                props.onInsert(marker)
                                            }
                                        >
                                            <span>
                                                {getLocalizedUsfmMarkerLabel(
                                                    marker,
                                                )}
                                            </span>
                                            <span
                                                className={
                                                    styles.insertMenuItemMarker
                                                }
                                            >{`\\${marker}`}</span>
                                        </Menu.Item>
                                    );
                                })}
                            </div>
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>
            <div className={styles.insertRule} />
        </div>
    );
}

function FrontmatterCard(props: {
    entry: BookFrontmatterEntry;
    onDelete: () => void;
    onChange: (entry: BookFrontmatterEntry) => void;
    onControlPress: (
        event: ReactMouseEvent<HTMLElement>,
        action: () => void,
    ) => void;
}) {
    const { t } = useLingui();
    const description = getLocalizedUsfmMarkerDescription(props.entry.marker);

    return (
        <article className={styles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.cardTitleBlock}>
                    <div className={styles.cardTitle}>
                        {getLocalizedUsfmMarkerLabel(props.entry.marker)}
                    </div>
                    <div
                        className={styles.cardMarker}
                    >{`\\${props.entry.marker}`}</div>
                    {description ? (
                        <div className={styles.cardDescription}>
                            {description}
                        </div>
                    ) : null}
                </div>

                <button
                    type="button"
                    className={styles.deleteButton}
                    onMouseDown={(event) =>
                        props.onControlPress(event, props.onDelete)
                    }
                    aria-label={t`Delete marker`}
                    title={t`Delete marker`}
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {props.entry.kind === "id" ? (
                <div className={styles.fieldRow}>
                    <TextInput
                        label={t`Book code`}
                        value={props.entry.code}
                        onChange={(event) =>
                            props.entry.kind === "id"
                                ? props.onChange({
                                      ...props.entry,
                                      code: event.target.value.toUpperCase(),
                                  })
                                : undefined
                        }
                    />
                    <TextInput
                        label={t`Description`}
                        value={props.entry.content}
                        onChange={(event) =>
                            props.entry.kind === "id"
                                ? props.onChange({
                                      ...props.entry,
                                      content: event.target.value,
                                  })
                                : undefined
                        }
                    />
                </div>
            ) : null}

            {props.entry.kind === "ide" ? (
                <>
                    <SelectPrimitive
                        items={IDE_OPTIONS}
                        value={props.entry.encoding}
                        placeholder={t`Select encoding`}
                        onValueChange={(value) =>
                            props.entry.kind === "ide"
                                ? props.onChange({
                                      ...props.entry,
                                      encoding: value ?? "",
                                  })
                                : undefined
                        }
                    />
                    <div className={styles.note}>
                        {t`Most projects should stay UTF-8. Change this only when the source text truly depends on another encoding.`}
                    </div>
                    {props.entry.encoding &&
                    props.entry.encoding.toUpperCase() !== "UTF-8" ? (
                        <div className={styles.warning}>
                            {t`This file is not using UTF-8. Avoid changing the encoding casually because it can corrupt the text.`}
                        </div>
                    ) : null}
                </>
            ) : null}

            {props.entry.kind === "generic" ? (
                <TextInput
                    label={t`Value`}
                    value={props.entry.value}
                    onChange={(event) =>
                        props.entry.kind === "generic"
                            ? props.onChange({
                                  ...props.entry,
                                  value: event.target.value,
                              })
                            : undefined
                    }
                />
            ) : null}
        </article>
    );
}
