import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { cosmiconfig } from "cosmiconfig";
import * as yaml from "yaml";
import type { z } from "zod";
import { ConfigTimeError } from "../../core/domain/config-time-error.js";
import type { Framework, Language } from "../../core/domain/language.js";
import {
	compareReleases,
	parseRelease,
	parseRunning,
} from "../../core/domain/tool-version.js";
import type {
	AnalysisUnitConfig,
	ContextsConfig,
	DetectConfig,
	EndpointsConfig,
	EntitiesConfig,
	EnumsConfig,
	IConfigLoader,
	InteractionsConfig,
	ModuleIdMapping,
	OpenApiConfig,
	OutputConfig,
	OverviewConfig,
	ResolvedConfig,
	StorageConfig,
	WorkersConfig,
} from "../../core/ports/config.port.js";
import { canonicalJson } from "./canonical-json.js";
import { type ConfigFile, ConfigFileSchema } from "./schema.js";
import {
	DEFAULT_KNOWN_ROLES,
	defaultConfigYaml,
	defaultExcludes,
} from "./defaults.js";

const MODULE_NAME = "project-map";

export class CosmiconfigLoader implements IConfigLoader {
	constructor(private readonly toolVersion: string | null = null) {}

	async load(
		cwd: string,
		explicitPath: string | null,
	): Promise<ResolvedConfig | null> {
		const explorer = cosmiconfig(MODULE_NAME, {
			searchPlaces: [
				".project-map.yaml",
				".project-map.yml",
				".project-map.json",
				"project-map.config.ts",
				"project-map.config.js",
				"package.json",
			],
			loaders: {
				".yaml": parseYamlContent,
				".yml": parseYamlContent,
			},
		});

		const result = explicitPath
			? await explorer.load(explicitPath)
			: await explorer.search(cwd);
		if (!result || result.isEmpty) {
			return null;
		}

		const validated = ConfigFileSchema.safeParse(result.config);
		if (!validated.success) {
			/* A schema violation is raised before any build runs, so it carries
			 * the config-time exit code rather than an unclassified crash. */
			throw new ConfigTimeError(
				"schema_violation",
				`${result.filepath} is not a valid configuration: ${issuesOf(validated.error)}`,
			);
		}
		this.refuseBelowFloor(validated.data.min_tool_version, result.filepath);
		return resolveConfig(validated.data, result.filepath, cwd);
	}

	/**
	 * project-map:BEH-017. Raised here rather than per command so that `build`
	 * and `facts` share one comparison, and before resolution so that a refused
	 * run has read nothing beyond the configuration.
	 */
	private refuseBelowFloor(floor: string | null, filepath: string): void {
		if (floor === null || this.toolVersion === null) {
			return;
		}
		const declared = parseRelease(floor);
		const running = parseRunning(this.toolVersion);
		if (declared === null || running === null) {
			return;
		}
		if (compareReleases(running, declared) >= 0) {
			return;
		}
		throw new ConfigTimeError(
			"tool_version_too_old",
			refusal(this.toolVersion, floor, filepath),
		);
	}

	async writeDefault(
		targetPath: string,
		language: Language,
		framework: Framework | null,
	): Promise<void> {
		const name = path.basename(path.dirname(path.resolve(targetPath)));
		const content = defaultConfigYaml(
			name || "my-project",
			language,
			framework,
			this.toolVersion,
		);
		await writeFile(targetPath, content, "utf8");
	}
}

function parseYamlContent(_filepath: string, content: string): unknown {
	const parsed: unknown = yaml.parse(content);
	return parsed;
}

function resolveConfig(
	raw: ConfigFile,
	sourcePath: string,
	cwd: string,
): ResolvedConfig {
	const configDir = path.dirname(sourcePath);
	const root = path.resolve(configDir, raw.root);
	const relRoot = path.relative(cwd, root) || ".";

	const exclude =
		raw.exclude.length > 0
			? raw.exclude
			: defaultExcludes(raw.project.language);

	const knownRoles =
		Object.keys(raw.contexts.auto.known_roles).length > 0
			? raw.contexts.auto.known_roles
			: DEFAULT_KNOWN_ROLES;

	const contexts: ContextsConfig = {
		custom: raw.contexts.custom,
		minFiles: raw.contexts.auto.min_files,
		depth: raw.contexts.auto.depth,
		knownRoles,
	};

	const entities: EntitiesConfig = {
		topN: raw.entities.top_n,
		includeFields: raw.entities.include_fields,
		includePrivateMethods: raw.entities.include_private_methods,
		importance: {
			methodCount: raw.entities.importance.method_count,
			fieldCount: raw.entities.importance.field_count,
			inboundReferences: raw.entities.importance.inbound_references,
		},
	};

	const enums: EnumsConfig = { baseClasses: raw.enums.base_classes };

	const endpoints: EndpointsConfig = {
		framework: raw.endpoints.framework,
		routesModule: raw.endpoints.routes_module,
		appVar: raw.endpoints.app_var,
	};

	const storage: StorageConfig = {
		baseClass: raw.storage.base_class,
		migrationsDir: raw.storage.migrations_dir,
		lastN: raw.storage.last_n,
	};

	const interactions: InteractionsConfig = { dir: raw.interactions.dir };

	const workers: WorkersConfig = { patterns: raw.workers.patterns };

	const overview: OverviewConfig = { path: raw.overview.path };
	const output = resolveOutput(raw);
	const configHash = hashConfig(raw);

	return {
		project: {
			name: raw.project.name,
			language: raw.project.language,
			frameworks: raw.project.frameworks,
		},
		root: relRoot,
		respectGitignore: raw.respect_gitignore,
		exclude,
		sections: raw.sections,
		overview,
		contexts,
		entities,
		enums,
		endpoints,
		storage,
		interactions,
		workers,
		output,
		repositoryIdentity: raw.repository_identity,
		analysisUnit: resolveAnalysisUnit(raw),
		openapi: resolveOpenApi(raw),
		detect: resolveDetect(raw),
		configHash,
		unitConfigHash: hashUnitConfig(raw),
		minToolVersion: raw.min_tool_version,
		sourcePath,
	};
}

function issuesOf(error: z.ZodError): string {
	return error.issues
		.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
		.join("; ");
}

function resolveOutput(raw: ConfigFile): OutputConfig {
	return {
		markdown: raw.output.markdown,
		json: raw.output.json,
		facts: raw.output.facts,
	};
}

function resolveAnalysisUnit(raw: ConfigFile): AnalysisUnitConfig {
	return {
		sources: {
			include: raw.analysis_unit.sources.include,
			exclude: raw.analysis_unit.sources.exclude,
		},
		configDeclarations: raw.analysis_unit.config_declarations,
	};
}

function resolveOpenApi(raw: ConfigFile): OpenApiConfig {
	return {
		serves: raw.openapi.serves.map((entry) => ({
			spec: entry.spec,
			contractId: entry.contract_id,
			mount: entry.mount,
		})),
		consumes: raw.openapi.consumes.map((entry) => ({
			generatedModule: entry.generated_module,
			spec: entry.spec,
			contractId: entry.contract_id,
		})),
	};
}

function resolveDetect(raw: ConfigFile): DetectConfig {
	return {
		unclassifiedBaseline: raw.detect.unclassified_baseline,
		inbound: {
			routers: raw.detect.inbound.routers.map((entry) => ({
				dsl: entry.dsl,
				pathArg: entry.path_arg,
				prefixFrom: entry.prefix_from,
				verbFrom: entry.verb_from,
				identityPreserving: entry.identity_preserving,
			})),
			serveRoots: raw.detect.inbound.serve_roots.map((entry) => ({
				function: entry.function,
				result: entry.result,
				mount: entry.mount,
			})),
		},
		outbound: {
			sinks: raw.detect.outbound.sinks.map(resolveSink),
			registry: raw.detect.outbound.registry.map((entry) => ({
				containerType: entry.container_type,
				access: entry.access,
			})),
			moduleIds: resolveModuleIds(raw.detect.outbound.module_ids),
		},
	};
}

/**
 * One module_id names exactly one type and one type carries exactly one
 * module_id: a mapping that is not a bijection would let the linker join a
 * consumer half onto the wrong library.
 */
function resolveModuleIds(
	raw: ConfigFile["detect"]["outbound"]["module_ids"],
): readonly ModuleIdMapping[] {
	const byType = new Map<string, string>();
	const byModuleId = new Map<string, string>();
	for (const entry of raw) {
		const claimedType = byModuleId.get(entry.module_id);
		const claimedId = byType.get(entry.type);
		if (claimedType !== undefined && claimedType !== entry.type) {
			throw new ConfigTimeError(
				"duplicate_module_id",
				`module_id ${entry.module_id} names both ${claimedType} and ${entry.type}`,
			);
		}
		if (claimedId !== undefined && claimedId !== entry.module_id) {
			throw new ConfigTimeError(
				"duplicate_module_id",
				`type ${entry.type} carries both module_id ${claimedId} and ${entry.module_id}`,
			);
		}
		byType.set(entry.type, entry.module_id);
		byModuleId.set(entry.module_id, entry.type);
	}
	return [...byType].map(([type, moduleId]) => ({ type, moduleId }));
}

function resolveSink(raw: ConfigFile["detect"]["outbound"]["sinks"][number]) {
	return {
		baseType: raw.base_type,
		call: raw.call.map((entry) => ({
			member: entry.member,
			pathArg: entry.path_arg,
			method: entry.method,
			target: entry.target,
		})),
		pathArg: raw.path_arg,
		method: raw.method,
		target: raw.target,
		pathVia: raw.path_via,
	};
}

/**
 * project-map:DLT-031. Whoever reads this does not know the key exists, so the
 * message spends its one chance on the remedy rather than on the mismatch.
 */
function refusal(running: string, floor: string, filepath: string): string {
	return [
		`You need to update project-map. Installed ${running}, this repository requires ${floor}.`,
		"",
		"  Update it:",
		"    npm i -g project-map-cli@latest",
		"",
		`  ${filepath} declares min_tool_version: ${floor}.`,
		`  If staying on ${running} is deliberate, lower that line instead.`,
	].join("\n");
}

function hashConfig(raw: ConfigFile): string {
	return digestOf(canonicalJson(raw));
}

/**
 * The slice of configuration the analysis unit carries (project-map:CTR-004).
 * Keeping it narrower than the whole document is what lets `build` amend a key
 * without invalidating the artifact it wrote in the same run.
 */
function hashUnitConfig(raw: ConfigFile): string {
	return digestOf(
		canonicalJson({
			detect: raw.detect,
			openapi: raw.openapi,
			analysis_unit: raw.analysis_unit,
		}),
	);
}

function digestOf(canonical: string): string {
	return `sha256:${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}
