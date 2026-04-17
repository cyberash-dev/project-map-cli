import * as path from "node:path";
import { globby } from "globby";
import type { DiscoveredFile, IFileWalker, WalkOptions } from "../../core/ports/filesystem.port.js";

export class GlobbyWalker implements IFileWalker {
  async walk(opts: WalkOptions): Promise<readonly DiscoveredFile[]> {
    const absRoot = path.resolve(opts.root);
    const matches = await globby(opts.include, {
      cwd: absRoot,
      ignore: [...opts.exclude],
      absolute: false,
      dot: false,
      followSymbolicLinks: false,
      onlyFiles: true,
    });

    return matches
      .map((rel) => rel.split(path.sep).join("/"))
      .sort()
      .map((relPath) => ({
        relPath,
        absPath: path.join(absRoot, relPath),
      }));
  }
}
