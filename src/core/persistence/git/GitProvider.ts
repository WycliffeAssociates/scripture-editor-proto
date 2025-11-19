export interface IGitProvider {
  cloneRepository(url: string, targetPath: string): Promise<undefined | Error>;
}
