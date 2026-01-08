export interface Importer {
    /**
     * Import something identified by a string `path`.
     * Historically this has been used for URLs, temporary paths, or other
     * ad-hoc identifiers depending on the concrete importer implementation.
     *
     * Return the path of the imported project on success, null on failure.
     */
    import(path: string): Promise<string | null>;
}
