import * as path from "node:path";
import type { Framework, Language } from "../../core/domain/language.js";
import type { IConfigLoader } from "../../core/ports/config.port.js";
import type { IFileReader } from "../../core/ports/filesystem.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";

export type InitArgs = {
  readonly cwd: string;
  readonly language: Language;
  readonly framework: Framework | null;
  readonly force: boolean;
};

export type InitDeps = {
  readonly configLoader: IConfigLoader;
  readonly reader: IFileReader;
  readonly logger: ILogger;
};

export class InitConfigUseCase {
  constructor(private readonly deps: InitDeps) {}

  async execute(args: InitArgs): Promise<{ written: boolean; targetPath: string }> {
    const targetPath = path.resolve(args.cwd, ".project-map.yaml");
    const exists = await this.deps.reader.exists(targetPath);
    if (exists && !args.force) {
      this.deps.logger.warn(
        `${targetPath} already exists; pass --force to overwrite or edit the file manually`,
      );
      return { written: false, targetPath };
    }
    await this.deps.configLoader.writeDefault(targetPath, args.language, args.framework);
    this.deps.logger.info(`wrote default config to ${targetPath}`);
    return { written: true, targetPath };
  }
}
