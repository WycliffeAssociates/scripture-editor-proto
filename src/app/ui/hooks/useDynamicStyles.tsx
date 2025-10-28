export type UseDynamicStylesheetHook = ReturnType<typeof useDynamicStylesheet>;
export function useDynamicStylesheet() {
    const dynamicCssStyleSheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        dynamicCssStyleSheet,
    ];

    function updateStyleSheet(css: string) {
        dynamicCssStyleSheet.replaceSync(css);
    }

    return {
        updateStyleSheet,
    };
}
