/**
 * Shared checksum seam.
 *
 * Import/index code uses this when it needs a stable content fingerprint without
 * caring whether hashing is done by browser code or a desktop-native backend.
 */
export interface IMd5Service {
  /**
   * Calculate a stable checksum for text content.
   */
  calculateMd5(text: string): Promise<string>;
}
