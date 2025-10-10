export interface IMd5Service {
    calculateMd5(text: string): Promise<string>;
}
