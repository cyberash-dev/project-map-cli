import * as path from "node:path";
import { extensionsFor } from "../../core/domain/language.js";
import type {
	BoundedContext,
	Entity,
	EnumType,
	Migration,
	ProjectMap,
	Table,
	Worker,
} from "../../core/domain/project-map.js";
import type { ResolvedConfig } from "../../core/ports/config.port.js";
import type { UnitSource } from "../../core/ports/analysis-unit.port.js";
import { readSourceSet } from "../../infrastructure/analysis-unit/read-sources.js";
import type {
	IFileReader,
	IFileWalker,
} from "../../core/ports/filesystem.port.js";
import type { IClock } from "../../core/ports/clock.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";
import type {
	ISourceParser,
	ParsedFile,
} from "../../core/ports/parser.port.js";
import type { IRevisionProvider } from "../../core/ports/revision.port.js";
import type { ExtractionContext } from "./extraction-context.js";
import { defaultExtractors, type ExtractorSet } from "./extractor-set.js";
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
	readonly extractors?: ExtractorSet;
};

export type BuildResult = {
	readonly map: ProjectMap;
	readonly projectRoot: string;
};

type ExtractorError = { readonly section: string; readonly message: string };

type ExtractorResults = {
	readonly contexts: BoundedContext[];
	readonly entities: Entity[];
	readonly enums: EnumType[];
	readonly storage: { tables: Table[]; migrations: Migration[] };
	readonly workers: Worker[];
	readonly errors: ExtractorError[];
};

type AssembleMapArgs = {
	readonly config: ResolvedConfig;
	readonly results: ExtractorResults;
	readonly overview: string | null;
	readonly revision: string | null;
	readonly scannedFiles: number;
	readonly discoveredFiles: number;
	readonly buildDurationMs: number;
};

export class BuildProjectMapUseCase {
	constructor(private readonly deps: BuildDeps) {}

	async execute(cwd: string): Promise<BuildResult> {
		const start = this.deps.clock.nowMs();
		const { config } = this.deps;

		const projectRoot = path.resolve(cwd, config.root);
		const include = extensionsFor(config.project.language).map(
			(ext) => `**/*${ext}`,
		);
		const discovered = await readSourceSet({
			walker: this.deps.walker,
			reader: this.deps.reader,
			selection: {
				root: projectRoot,
				include,
				exclude: config.exclude,
				respectGitignore: config.respectGitignore,
			},
		});
		this.deps.logger.info(
			`scanned ${discovered.length} ${config.project.language} file(s) under ${projectRoot}`,
		);

		const parsed = this.parseAll(discovered, config.project.language);
		this.deps.logger.info(`parsed ${parsed.length} file(s) successfully`);

		const ctx = this.buildExtractionContext(projectRoot, parsed);
		const results = await this.runExtractors(ctx);

		const overview = await this.loadOverview(projectRoot);
		const revision = await this.deps.revision.current(cwd);
		const end = this.deps.clock.nowMs();

		const map = this.assembleMap({
			config,
			results,
			overview,
			revision,
			scannedFiles: parsed.length,
			discoveredFiles: discovered.length,
			buildDurationMs: end - start,
		});
		return { map, projectRoot };
	}

	private buildExtractionContext(
		projectRoot: string,
		parsed: ParsedFile[],
	): ExtractionContext {
		const { config } = this.deps;
		const filesByPath = new Map(parsed.map((p) => [p.relPath, p]));
		const symbols = buildSymbolIndex(parsed, config.project.language);
		return {
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
	}

	private async runExtractors(
		ctx: ExtractionContext,
	): Promise<ExtractorResults> {
		const errors: ExtractorError[] = [];
		const extractors = this.deps.extractors ?? defaultExtractors();
		const safe = async <T>(
			label: string,
			fn: () => Promise<T>,
			fallback: T,
		): Promise<T> => {
			try {
				return await fn();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				errors.push({ section: label, message });
				this.deps.logger.warn(`extractor ${label} failed: ${message}`);
				return fallback;
			}
		};

		const [contexts, entities, enums, storage, workers] = await Promise.all([
			safe<BoundedContext[]>(
				"contexts",
				() => extractors.contexts.extract(ctx),
				[],
			),
			safe<Entity[]>("entities", () => extractors.entities.extract(ctx), []),
			safe<EnumType[]>("enums", () => extractors.enums.extract(ctx), []),
			safe<{ tables: Table[]; migrations: Migration[] }>(
				"storage",
				() => extractors.storage.extract(ctx),
				{ tables: [], migrations: [] },
			),
			safe<Worker[]>("workers", () => extractors.workers.extract(ctx), []),
		]);

		return {
			contexts,
			entities,
			enums,
			storage,
			workers,
			/*
			 * Errors are pushed in promise-completion order, which the
			 * document must not depend on (project-map:INV-001).
			 */
			errors: [...errors].sort((a, b) => a.section.localeCompare(b.section)),
		};
	}

	private assembleMap(args: AssembleMapArgs): ProjectMap {
		const { config, results } = args;
		return {
			metadata: {
				toolVersion: this.deps.toolVersion,
				generatedAt: this.deps.clock.nowIso(),
				revision: args.revision,
				configHash: config.configHash,
				scannedFiles: args.scannedFiles,
				excludedFiles: Math.max(0, args.discoveredFiles - args.scannedFiles),
				buildDurationMs: args.buildDurationMs,
				language: config.project.language,
				frameworks: config.project.frameworks,
				overview: args.overview,
				errors: results.errors,
			},
			project: {
				name: config.project.name,
				language: config.project.language,
				frameworks: config.project.frameworks,
			},
			contexts: results.contexts,
			entities: results.entities,
			enums: results.enums,
			storage: results.storage,
			workers: results.workers,
		};
	}

	/**
	 * Parses what the source set holds. Nothing here reads the filesystem or
	 * sees an absolute path: extraction is a function of the text alone, the
	 * same discipline project-map:POL-003 gives detection.
	 */
	private parseAll(
		sources: readonly UnitSource[],
		language: ResolvedConfig["project"]["language"],
	): ParsedFile[] {
		if (!this.deps.parser.supports(language)) {
			this.deps.logger.warn(
				`no parser registered for ${language}; extractors will see no files`,
			);
			return [];
		}
		const parsed: ParsedFile[] = [];
		for (const source of sources) {
			const file = this.deps.parser.parse(language, source.text, source.path);
			if (file === null) {
				this.deps.logger.warn(`parse failed for ${source.path}`);
				continue;
			}
			parsed.push(file);
		}
		return parsed;
	}

	private async loadOverview(projectRoot: string): Promise<string | null> {
		const overviewCfg = this.deps.config.overview.path;
		if (!overviewCfg) {
			return null;
		}
		const abs = path.resolve(projectRoot, overviewCfg);
		if (!(await this.deps.reader.exists(abs))) {
			return null;
		}
		try {
			return await this.deps.reader.read(abs);
		} catch {
			return null;
		}
	}
}
