import * as os from "node:os";
import * as path from "node:path";
import pLimit from "p-limit";
import { extensionsFor } from "../../core/domain/language.js";
import type {
  BoundedContext,
  Endpoint,
  Entity,
  EnumType,
  Interaction,
  Migration,
  ProjectMap,
  Table,
  Worker,
} from "../../core/domain/project-map.js";
import type { ResolvedConfig } from "../../core/ports/config.port.js";
import type {
  DiscoveredFile,
  IFileReader,
  IFileWalker,
} from "../../core/ports/filesystem.port.js";
import type { IClock } from "../../core/ports/clock.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";
import type { ISourceParser, ParsedFile } from "../../core/ports/parser.port.js";
import type { IRevisionProvider } from "../../core/ports/revision.port.js";
import type { ExtractionContext } from "./extraction-context.js";
import { ContextsExtractor } from "./slices/contexts/extract.js";
import { EndpointsExtractor } from "./slices/endpoints/extract.js";
import { EntitiesExtractor } from "./slices/entities/extract.js";
import { EnumsExtractor } from "./slices/enums/extract.js";
import { InteractionsExtractor } from "./slices/interactions/extract.js";
import { StorageExtractor } from "./slices/storage/extract.js";
import { WorkersExtractor } from "./slices/workers/extract.js";
import { buildSymbolIndex } from "./symbol-index.js";

export type BuildDeps = {
  readonly config: ResolvedConfig;
  readonly walker: IFileWalker;
  readonly reader: IFileReader;
  readonly parser: ISourceParser;
  readonly clock: IClock;
  readonly logger: ILogger;
  readonly revision: IRevisionProvider;
  readonly toolVersion: string;
};

export type BuildResult = {
  readonly map: ProjectMap;
  readonly projectRoot: string;
};

export class BuildProjectMapUseCase {
  constructor(private readonly deps: BuildDeps) {}

  async execute(cwd: string): Promise<BuildResult> {
    const start = this.deps.clock.nowMs();
    const { config } = this.deps;

    const projectRoot = path.resolve(cwd, config.root);
    const include = extensionsFor(config.project.language).map((ext) => `**/*${ext}`);
    const discovered = await this.deps.walker.walk({
      root: projectRoot,
      include,
      exclude: config.exclude,
    });
    this.deps.logger.info(
      `scanned ${discovered.length} ${config.project.language} file(s) under ${projectRoot}`,
    );

    const parsed = await this.parseAll(discovered, config.project.language);
    this.deps.logger.info(`parsed ${parsed.length} file(s) successfully`);

    const symbols = buildSymbolIndex(parsed, config.project.language);

    const filesByPath = new Map(parsed.map((p) => [p.relPath, p]));
    const ctx: ExtractionContext = {
      config,
      projectRoot,
      language: config.project.language,
      files: parsed,
      filesByPath,
      parser: this.deps.parser,
      reader: this.deps.reader,
      symbols,
      logger: this.deps.logger,
    };

    const errors: Array<{ section: string; message: string }> = [];
    const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        errors.push({ section: label, message: (err as Error).message });
        this.deps.logger.warn(`extractor ${label} failed: ${(err as Error).message}`);
        return fallback;
      }
    };

    const [contexts, entities, enums, endpoints, storage, interactions, workers] = await Promise.all([
      safe<BoundedContext[]>("contexts", () => new ContextsExtractor().extract(ctx), []),
      safe<Entity[]>("entities", () => new EntitiesExtractor().extract(ctx), []),
      safe<EnumType[]>("enums", () => new EnumsExtractor().extract(ctx), []),
      safe<Endpoint[]>("endpoints", () => new EndpointsExtractor().extract(ctx), []),
      safe<{ tables: Table[]; migrations: Migration[] }>(
        "storage",
        () => new StorageExtractor().extract(ctx),
        { tables: [], migrations: [] },
      ),
      safe<Interaction[]>("interactions", () => new InteractionsExtractor().extract(ctx), []),
      safe<Worker[]>("workers", () => new WorkersExtractor().extract(ctx), []),
    ]);

    const overview = await this.loadOverview(projectRoot);
    const revision = await this.deps.revision.current(cwd);
    const end = this.deps.clock.nowMs();

    const map: ProjectMap = {
      metadata: {
        toolVersion: this.deps.toolVersion,
        generatedAt: this.deps.clock.nowIso(),
        revision,
        configHash: config.configHash,
        scannedFiles: parsed.length,
        excludedFiles: Math.max(0, discovered.length - parsed.length),
        buildDurationMs: end - start,
        language: config.project.language,
        frameworks: config.project.frameworks,
        overview,
        errors,
      },
      project: {
        name: config.project.name,
        language: config.project.language,
        frameworks: config.project.frameworks,
      },
      contexts,
      entities,
      enums,
      endpoints,
      storage,
      interactions,
      workers,
    };
    return { map, projectRoot };
  }

  private async parseAll(
    discovered: readonly DiscoveredFile[],
    language: ResolvedConfig["project"]["language"],
  ): Promise<ParsedFile[]> {
    if (!this.deps.parser.supports(language)) {
      this.deps.logger.warn(`no parser registered for ${language}; extractors will see no files`);
      return [];
    }
    const limit = pLimit(Math.max(1, os.cpus().length));
    const tasks = discovered.map((f) =>
      limit(async () => {
        try {
          const content = await this.deps.reader.read(f.absPath);
          return this.deps.parser.parse(language, content, f.relPath, f.absPath);
        } catch (err) {
          this.deps.logger.warn(`read/parse failed for ${f.relPath}: ${(err as Error).message}`);
          return null;
        }
      }),
    );
    const results = await Promise.all(tasks);
    return results.filter((p): p is ParsedFile => p !== null);
  }

  private async loadOverview(projectRoot: string): Promise<string | null> {
    const overviewCfg = this.deps.config.overview.path;
    if (!overviewCfg) return null;
    const abs = path.resolve(projectRoot, overviewCfg);
    if (!(await this.deps.reader.exists(abs))) return null;
    try {
      return await this.deps.reader.read(abs);
    } catch {
      return null;
    }
  }
}
