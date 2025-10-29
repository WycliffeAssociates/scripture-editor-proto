/* ------------------------------ File Handle ------------------------------ */

// Define the extended writer interface to match FileSystemWritableFileStream's writer
export interface TauriWritableFileStreamWriter
    extends WritableStreamDefaultWriter<any> {
    seek(position: number): Promise<void>;

    truncate(size: number): Promise<void>;
}
