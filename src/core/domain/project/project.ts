/** Persisted language-direction values shared by metadata parsing and UI layout. */
export const LanguageDirection = {
  LTR: "ltr",
  RTL: "rtl",
} as const;

export type LanguageDirection =
  (typeof LanguageDirection)[keyof typeof LanguageDirection];
