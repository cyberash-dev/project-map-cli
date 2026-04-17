export interface IRevisionProvider {
  current(cwd: string): Promise<string | null>;
}
