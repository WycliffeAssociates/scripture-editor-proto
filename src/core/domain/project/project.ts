export type ProjectFile = {
    title: string | undefined;
    identifier: string | undefined;
    sort: number | undefined;
    path: string;
};

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

export interface ProjectFile2 {
    path: string;
    filename: string;
    mimetype: string;
}

export interface Book extends ProjectFile2 {
    code: string;
    name: string;
    sort: number;
}
