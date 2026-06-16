import { style } from "@vanilla-extract/css";

import { buttonSizes } from "@/app/ui/components/primitives/Button/button.css.ts";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const editorWrapper = style({
  display: "block",
});

export const contentEditable = style({
  outline: "none",
  minHeight: "100px",
  padding: vars.spacing.sm,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: vars.color.surfacePrimary,
});

export const nestedEditorButton = style([
  buttonSizes.iconXs,
  {
    aspectRatio: "1 / 1",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: vars.color.surfaceSecondary,
    selectors: {
      "&:hover": {
        background: vars.color.surfaceTertiary,
      },
    },
  },
]);

export const placeholder = style({
  color: vars.color.onSurfaceTertiary,
});
