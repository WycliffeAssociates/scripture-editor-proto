// FormFocusContext.tsx
//
// Shared focus state for form-mode editors. Lets the source and reference
// panes paint a matching highlight on the row corresponding to whichever
// side currently has focus, and nudges the matching row on the *other*
// pane into view.
//
// Keying: `(sid, rowKey)` identifies the same logical row on both panes.
// In the discourse-first form mode, `rowKey` is a per-block fragment
// position (e.g. `frag:0`). Skeleton-mirroring during match-formatting
// keeps source and reference aligned with parallel block sequences, so
// matching rowKeys map to matching positions across panes.

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";

export type FormFocusKey = {
    sid: string;
    rowKey: string;
};

export type FormFocusContextValue = {
    focused: FormFocusKey | null;
    setFocused: (key: FormFocusKey | null) => void;
};

const FormFocusContext = createContext<FormFocusContextValue>({
    focused: null,
    setFocused: () => {},
});

export const FORM_ROW_SID_ATTR = "data-form-row-sid";
export const FORM_ROW_KEY_ATTR = "data-form-row-key";

export function FormFocusProvider(props: { children: ReactNode }) {
    const [focused, setFocused] = useState<FormFocusKey | null>(null);

    useEffect(() => {
        if (typeof document === "undefined") return;
        // Always clear the previously-aligned reference fragment first
        // so a moved focus doesn't leave the old highlight behind.
        clearAlignedAttribute();
        if (!focused) return;

        // Cross-pane scroll + highlight use two coordinates: the verse
        // SID, and the ordinal of the focused fragment among same-SID
        // fragments on its pane. A verse can span many blocks, so
        // picking the right one on the other pane requires "Nth match,"
        // not just "first match." Both panes have parallel block
        // sequences post match-formatting, so source's Nth fragment of
        // v5 maps to reference's Nth fragment of v5.
        const ordinal = parseFocusOrdinal(focused.rowKey);
        const selector = `[${FORM_ROW_SID_ATTR}="${cssEscape(focused.sid)}"]`;
        const active = document.activeElement;
        const myPane = active?.closest("[data-form-pane]") ?? null;
        const otherPanes = document.querySelectorAll("[data-form-pane]");
        for (const pane of otherPanes) {
            if (pane === myPane) continue;
            const matches = pane.querySelectorAll<HTMLElement>(selector);
            const target = matches[ordinal] ?? matches[matches.length - 1];
            if (!target) continue;
            target.setAttribute("data-aligned", "true");
            // Center the aligned reference fragment in its scroll
            // container so the user's eye lands on it. `nearest` (the
            // previous behavior) often left it pinned to the top or
            // bottom edge.
            target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }, [focused]);

    return (
        <FormFocusContext.Provider value={{ focused, setFocused }}>
            {props.children}
        </FormFocusContext.Provider>
    );
}

export function useFormFocus(): FormFocusContextValue {
    return useContext(FormFocusContext);
}

function cssEscape(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
}

function parseFocusOrdinal(rowKey: string): number {
    const parsed = Number.parseInt(rowKey, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clearAlignedAttribute(): void {
    const stale = document.querySelectorAll<HTMLElement>(
        '[data-aligned="true"]',
    );
    for (const el of stale) {
        el.removeAttribute("data-aligned");
    }
}
