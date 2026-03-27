/**
 * @interface Importer
 * Minimal contract shared by the low-level import implementations in this
 * folder.
 *
 * These classes all accept some external source identifier, materialize it into
 * managed app storage, and return the resulting directory path for the next stage
 * of the pipeline.
 */
export interface Importer {
    /**
     * Import something identified by a string `path`.
     * Historically this has been used for URLs, temporary paths, or other
     * ad-hoc identifiers depending on the concrete importer implementation.
     *
     * Return the path of the imported project on success.
     */
    import(path: string): Promise<string>;
}
