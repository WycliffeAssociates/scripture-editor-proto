import { useLingui } from "@lingui/react/macro";
import {
    ActionIcon,
    Button,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
} from "@mantine/core";
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Minimize2,
    SkipForward,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormatMatchingRunReport } from "@/app/ui/data/formatMatching.ts";
import type { SkippedMarkerSuggestion } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 290;

type Props = {
    opened: boolean;
    onClose: () => void;
    report: FormatMatchingRunReport | null;
    autoOpen: boolean;
    setAutoOpen: (value: boolean) => void;
    onApplySuggestion: (
        suggestion: SkippedMarkerSuggestion,
    ) => Promise<boolean>;
};

type PopupPosition = {
    top: number;
    left: number;
    anchor: "above" | "below";
};

type PanelSize = {
    width: number;
    height: number;
};

function suggestionId({
    id,
    scope,
    bookCode,
    chapter,
    verse,
    marker,
}: SkippedMarkerSuggestion) {
    return [scope, bookCode ?? "", chapter ?? "", verse, marker, id].join(":");
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getFallbackPosition(panelSize: PanelSize): PopupPosition {
    if (typeof window === "undefined") {
        return { top: 24, left: 24, anchor: "below" };
    }
    return {
        top: Math.max(12, window.innerHeight - panelSize.height - 20),
        left: Math.max(12, window.innerWidth - panelSize.width - 20),
        anchor: "below",
    };
}

function getPopupPositionNearCursor(panelSize: PanelSize): PopupPosition {
    if (typeof window === "undefined") {
        return { top: 24, left: 24, anchor: "below" };
    }

    const fallback = getFallbackPosition(panelSize);
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return fallback;

    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
        const focusElement =
            selection.focusNode?.nodeType === Node.ELEMENT_NODE
                ? (selection.focusNode as Element)
                : selection.focusNode?.parentElement;
        if (focusElement) {
            rect = focusElement.getBoundingClientRect();
        }
    }

    if (rect.width === 0 && rect.height === 0) return fallback;

    const fitsAbove = rect.top - panelSize.height - 10 >= 8;
    const top = fitsAbove
        ? clamp(rect.top - 10, panelSize.height + 8, window.innerHeight - 8)
        : clamp(rect.bottom + 10, 8, window.innerHeight - panelSize.height - 8);

    return {
        top,
        left: clamp(
            rect.left,
            8,
            Math.max(8, window.innerWidth - panelSize.width - 8),
        ),
        anchor: fitsAbove ? "above" : "below",
    };
}

export function MatchFormattingSuggestionsPanel({
    opened,
    onClose,
    report,
    autoOpen,
    setAutoOpen,
    onApplySuggestion,
}: Props) {
    const { t } = useLingui();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [panelSize, setPanelSize] = useState<PanelSize>({
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    });
    const [position, setPosition] = useState<PopupPosition>(() =>
        getFallbackPosition({ width: PANEL_WIDTH, height: PANEL_HEIGHT }),
    );

    const visibleSuggestions = useMemo(() => {
        if (!report) return [];
        const dismissed = new Set(dismissedIds);
        return report.suggestions.filter(
            (suggestion) => !dismissed.has(suggestionId(suggestion)),
        );
    }, [dismissedIds, report]);

    useEffect(() => {
        if (visibleSuggestions.length === 0) {
            setActiveIndex(0);
            return;
        }
        setActiveIndex((prev) => Math.min(prev, visibleSuggestions.length - 1));
    }, [visibleSuggestions.length]);

    useEffect(() => {
        if (!opened) return;

        const panel = panelRef.current;
        if (!panel) return;

        const updateSize = () => {
            const rect = panel.getBoundingClientRect();
            const width = Math.ceil(rect.width);
            const height = Math.ceil(rect.height);
            if (width <= 0 || height <= 0) return;
            setPanelSize((prev) =>
                prev.width === width && prev.height === height
                    ? prev
                    : { width, height },
            );
        };

        updateSize();

        const observer = new ResizeObserver(updateSize);
        observer.observe(panel);
        return () => observer.disconnect();
    }, [opened]);

    useEffect(() => {
        if (!opened || visibleSuggestions.length === 0) return;

        const updatePosition = () => {
            setPosition(getPopupPositionNearCursor(panelSize));
        };

        updatePosition();
        document.addEventListener("selectionchange", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);

        return () => {
            document.removeEventListener("selectionchange", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [opened, panelSize, visibleSuggestions.length]);

    if (!opened || !report || visibleSuggestions.length === 0) return null;

    const boundedIndex = clamp(activeIndex, 0, visibleSuggestions.length - 1);
    const current = visibleSuggestions[boundedIndex];
    if (!current) return null;
    const currentId = suggestionId(current);
    const isApplying = applyingId === currentId;
    const location = current.bookCode
        ? `${current.bookCode} ${current.chapter ?? "?"}:${current.verse}`
        : `${current.chapter ?? "?"}:${current.verse}`;

    const advance = () => {
        setActiveIndex((prev) => {
            if (visibleSuggestions.length <= 1) return 0;
            return (prev + 1) % visibleSuggestions.length;
        });
    };
    const retreat = () => {
        setActiveIndex((prev) => {
            if (visibleSuggestions.length <= 1) return 0;
            return (
                (prev - 1 + visibleSuggestions.length) %
                visibleSuggestions.length
            );
        });
    };

    const dismissCurrent = () => {
        setDismissedIds((prev) =>
            prev.includes(currentId) ? prev : [...prev, currentId],
        );
    };

    return (
        <Paper
            ref={panelRef}
            withBorder
            shadow="lg"
            radius="md"
            p="sm"
            w={PANEL_WIDTH}
            style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                transform:
                    position.anchor === "above"
                        ? "translateY(-100%)"
                        : undefined,
                zIndex: 300,
            }}
        >
            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Stack gap={1}>
                        <Text fw={600} size="sm">
                            {t`Formatting Suggestion`}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {boundedIndex + 1}/{visibleSuggestions.length} {`·`}{" "}
                            {location}
                        </Text>
                    </Stack>
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={onClose}
                        aria-label={t`Minimize suggestions`}
                    >
                        <Minimize2 size={14} />
                    </ActionIcon>
                </Group>

                <Stack gap={4}>
                    <Text size="sm">
                        {t`Put cursor in verse #${current.verse} to place this marker near your translation:`}
                    </Text>
                    <Paper
                        p="xs"
                        radius="sm"
                        style={{
                            background: "var(--mantine-color-gray-0)",
                            borderLeft: "3px solid var(--mantine-color-blue-5)",
                        }}
                    >
                        <Text
                            size="xs"
                            c="dimmed"
                            style={{ fontStyle: "italic" }}
                        >
                            {current.sourceBlockExcerpt ||
                                current.sourceMarkerLocalContext}
                        </Text>
                    </Paper>
                </Stack>

                <Button
                    fullWidth
                    size="sm"
                    leftSection={<Check size={14} />}
                    loading={isApplying}
                    onClick={async () => {
                        setApplyingId(currentId);
                        const applied = await onApplySuggestion(current);
                        setApplyingId(null);
                        if (applied) {
                            dismissCurrent();
                        }
                        advance();
                    }}
                >
                    {t`Insert \\${current.marker} Here`}
                </Button>

                <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Button
                        size="compact-sm"
                        variant="default"
                        leftSection={<ChevronLeft size={12} />}
                        onClick={retreat}
                    >
                        {t`Prev`}
                    </Button>
                    <Button
                        size="compact-sm"
                        variant="subtle"
                        color="gray"
                        leftSection={<SkipForward size={12} />}
                        onClick={() => {
                            dismissCurrent();
                            advance();
                        }}
                    >
                        {t`Skip Suggestion`}
                    </Button>
                    <Button
                        size="compact-sm"
                        variant="default"
                        leftSection={<ChevronRight size={12} />}
                        onClick={advance}
                    >
                        {t`Next`}
                    </Button>
                </Group>
                <Text size="xs" c="dimmed">
                    {t`Skip removes this suggestion from this session. Next keeps it and moves forward.`}
                </Text>

                <Switch
                    checked={autoOpen}
                    onChange={(event) =>
                        setAutoOpen(event.currentTarget.checked)
                    }
                    label={t`Auto-open when new suggestions are found`}
                />
            </Stack>
        </Paper>
    );
}
