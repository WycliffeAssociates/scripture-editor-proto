/* ------------------------------ File Handle ------------------------------ */

// Define the extended writer interface to match FileSystemWritableFileStream's writer
// biome-ignore lint/suspicious/noExplicitAny: <web.d.ts stream types use any >
export interface TauriWritableFileStreamWriter<W = any>
  extends WritableStreamDefaultWriter<W> {
  seek(position: number): Promise<void>;

  truncate(size: number): Promise<void>;
}
