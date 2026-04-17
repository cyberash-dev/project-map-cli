export type DiscoveredFile = {
  readonly relPath: string;
  readonly absPath: string;
};

export type WalkOptions = {
  readonly root: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};

export interface IFileWalker {
  walk(opts: WalkOptions): Promise<readonly DiscoveredFile[]>;
}

export interface IFileReader {
  read(absPath: string): Promise<string>;
  exists(absPath: string): Promise<boolean>;
}

export interface IFileWriter {
  write(absPath: string, content: string): Promise<void>;
  ensureDir(absPath: string): Promise<void>;
}
