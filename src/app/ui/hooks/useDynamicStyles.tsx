/**
 * Mount a dedicated adopted stylesheet for runtime-generated editor styles.
 *
 * Some style rules depend on loaded marker catalogs or current workspace state,
 * so they cannot live entirely in static CSS. This hook gives the workspace one
 * isolated stylesheet it can replace wholesale.
 */
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
