export interface ProjectMetadata {
    name: string;
    id: string;
    language: Language;
}

export interface Language {
    name: string;
    id: string;
    direction: LanguageDirection;
}

export const LanguageDirection = {
    LTR: "ltr",
    RTL: "rtl",
} as const;

export type LanguageDirection =
    (typeof LanguageDirection)[keyof typeof LanguageDirection];
