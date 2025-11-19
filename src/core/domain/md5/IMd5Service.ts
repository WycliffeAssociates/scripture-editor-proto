/**
 * @interface IMd5Service
 * @description Defines the contract for an MD5 checksum calculation service.
 *              This allows for dependency injection of different MD5 implementations (e.g., web crypto, native Tauri).
 */
export interface IMd5Service {
  /**
   * @method calculateMd5
   * @description Calculates the MD5 checksum of a given text string.
   * @param text - The input string for which to calculate the MD5 checksum.
   * @returns A Promise that resolves to the MD5 checksum as a hexadecimal string.
   */
  calculateMd5(text: string): Promise<string>;
}
