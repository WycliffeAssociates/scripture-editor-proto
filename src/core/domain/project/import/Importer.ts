export interface Importer {
    import(path: string): Promise<boolean>;
}