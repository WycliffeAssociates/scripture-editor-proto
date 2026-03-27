/**
 * Platform-specific "open/export with the host environment" seam.
 */
export interface IOpener {
    open?(path: string): Promise<void>;
    export(path: string, filename?: string): Promise<void>;
}
