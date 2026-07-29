import { createRequire } from "node:module";
import * as path from "node:path";
import { Command } from "commander";
import { renderJson } from "../features/build/rendering/json.js";
import { renderMarkdown } from "../features/build/rendering/markdown.js";
import {
	analysisUnitMaterializer,
	buildUseCase,
	type Container,
	createContainer,
	detectUseCase,
	initUseCase,
	installClaudeHookUseCase,
	installClaudeSkillUseCase,
	installGitHookUseCase,
	versionUseCase,
} from "./container.js";
import type { ResolvedConfig } from "../core/ports/config.port.js";
import { DETECTOR_SOURCE_DIGEST } from "../features/detect/registry/build-digest.generated.js";
import {
	renderFactsArtifact,
	renderFactsSidecar,
	sidecarPathFor,
} from "../features/detect/render/artifact.js";
import { ConfigTimeError } from "../core/domain/config-time-error.js";
import type { Framework, Language } from "../core/domain/language.js";
import {
	ALL_LANGUAGES,
	FRAMEWORKS_BY_LANGUAGE,
} from "../core/domain/language.js";
import {
	isDetectionSection,
	SECTION_IDS,
	type SectionId,
} from "../core/domain/project-map.js";
import type { FactSet } from "../features/detect/detect.use-case.js";
import { type CheckOutcome, checkFactsArtifact } from "./facts-check.js";

const require = createRequire(import.meta.url);

function readToolVersion(): string {
	const pkg: unknown = require("../../package.json");
	if (
		typeof pkg === "object" &&
		pkg !== null &&
		"version" in pkg &&
		typeof pkg.version === "string"
	) {
		return pkg.version;
	}
	throw new Error("package.json is missing a string `version` field");
}

const TOOL_VERSION = readToolVersion();

const ALL_FRAMEWORKS = Array.from(
	new Set(Object.values(FRAMEWORKS_BY_LANGUAGE).flat()),
);

type InitOptions = {
	readonly lang: string;
	readonly framework?: string;
	readonly force: boolean;
};

type BuildOptions = {
	readonly config?: string;
	readonly out?: string;
	readonly only?: string;
	readonly json?: string | boolean;
	readonly check: boolean;
	readonly verbose: boolean;
};

type FactsOptions = {
	readonly config?: string;
	readonly unitDigest: boolean;
	readonly verbose: boolean;
};

type InstallGitHookOptions = {
	readonly type: string;
	readonly force: boolean;
};

type ClaudeInstallOptions = {
	readonly scope: string;
	readonly force: boolean;
	readonly hook: boolean;
	readonly skill: boolean;
};

export function createProgram(): Command {
	const program = new Command()
		.name("project-map")
		.description("Generate a deterministic PROJECT_MAP.md architectural map.")
		.version(TOOL_VERSION, "-V, --version-number");

	registerInitCommand(program);
	registerBuildCommand(program);
	registerFactsCommand(program);
	registerVersionCommand(program);
	registerInstallGitHookCommand(program);
	registerClaudeCommand(program);
	registerWatchCommand(program);

	return program;
}

function registerInitCommand(program: Command): void {
	const command = program
		.command("init")
		.description(
			"Scaffold a default .project-map.yaml in the current directory.",
		)
		.option(
			"--lang <language>",
			`language (${ALL_LANGUAGES.join("|")})`,
			"python",
		)
		.option(
			"--framework <framework>",
			`framework (${ALL_FRAMEWORKS.join("|")})`,
		)
		.option("--force", "overwrite existing config", false);

	command.action(async () => {
		const opts = command.opts<InitOptions>();
		const container = createContainer(TOOL_VERSION, false);
		const useCase = initUseCase(container);
		const language = assertLanguage(opts.lang);
		const framework = opts.framework ? assertFramework(opts.framework) : null;
		const result = await useCase.execute({
			cwd: process.cwd(),
			language,
			framework,
			force: Boolean(opts.force),
		});
		if (!result.written) {
			process.exitCode = 1;
		}
	});
}

function registerBuildCommand(program: Command): void {
	const command = program
		.command("build")
		.description("Build PROJECT_MAP.md and optional JSON output.")
		.option("--config <path>", "explicit path to .project-map.yaml")
		.option("--out <path>", "override output path")
		.option("--only <sections>", "comma-separated section IDs to include")
		.option("--json [path]", "also emit JSON output (path optional)")
		.option(
			"--check",
			"write nothing; exit 1 on drift, 3 on a fingerprint mismatch, 4 on a mandatory diagnostic",
			false,
		)
		.option("--verbose", "verbose logging", false);

	command.action(async () => {
		await runBuild(command.opts<BuildOptions>());
	});
}

/**
 * A configuration-time error is raised before any build runs, so it carries its
 * own exit code rather than surfacing as an unclassified crash.
 */
async function runBuild(opts: BuildOptions): Promise<void> {
	try {
		await build(opts);
	} catch (error: unknown) {
		if (!(error instanceof ConfigTimeError)) {
			throw error;
		}
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 5;
	}
}

async function build(opts: BuildOptions): Promise<void> {
	{
		const container = createContainer(TOOL_VERSION, Boolean(opts.verbose));
		const config = await container.configLoader.load(
			process.cwd(),
			opts.config ?? null,
		);
		if (!config) {
			container.logger.error(
				"no .project-map.yaml found. Run `project-map init` to create one.",
			);
			process.exitCode = 2;
			return;
		}
		const effectiveConfig = applyOnly(
			applyOutputOverrides(config, opts.out, opts.json),
			opts.only,
		);
		const useCase = buildUseCase(container, effectiveConfig);
		const { map, projectRoot } = await useCase.execute(process.cwd());
		const detection = await detectFacts(container, effectiveConfig);
		const markdown = renderMarkdown(
			map,
			effectiveConfig,
			detection?.factSet ?? null,
		);
		const mdPath = path.resolve(projectRoot, effectiveConfig.output.markdown);

		if (opts.check) {
			await runCheck({
				container,
				config: effectiveConfig,
				markdown,
				mdPath,
				detection,
				projectRoot,
			});
			return;
		}

		await container.writer.write(mdPath, markdown);
		container.logger.info(`wrote ${mdPath}`);
		if (effectiveConfig.output.json) {
			const jsonPath = path.resolve(projectRoot, effectiveConfig.output.json);
			await container.writer.write(jsonPath, renderJson(map));
			container.logger.info(`wrote ${jsonPath}`);
		}
		await emitFacts(container, effectiveConfig, projectRoot, detection);
	}
}

type Detection = {
	readonly factSet: FactSet;
	readonly artifact: string;
	readonly unitDigest: string;
	readonly startedMs: number;
};

/**
 * Detection runs whenever the document or the artifact needs it, so the two
 * never disagree: one analysis unit, one fact set, rendered twice.
 */
async function detectFacts(
	container: Container,
	config: ResolvedConfig,
): Promise<Detection | null> {
	const wanted =
		config.output.facts !== null || config.sections.some(isDetectionSection);
	if (!wanted) {
		return null;
	}
	const startedMs = container.clock.nowMs();
	const unit = await analysisUnitMaterializer(container, null).materialize({
		cwd: process.cwd(),
		config,
		specLocators: config.openapi.serves.map((entry) => entry.spec),
		registryVersion: DETECTOR_SOURCE_DIGEST,
	});
	const factSet = detectUseCase(container.parser).execute({
		unit,
		openapi: config.openapi,
		detect: config.detect,
	});
	return {
		factSet,
		unitDigest: unit.digest,
		startedMs,
		artifact: renderFactsArtifact({
			repositoryIdentity: unit.repositoryIdentity,
			unitDigest: unit.digest,
			analyzerBuildDigest: DETECTOR_SOURCE_DIGEST,
			registryDigest: DETECTOR_SOURCE_DIGEST,
			facts: factSet.facts,
			diagnostics: factSet.diagnostics,
			coverage: factSet.coverage,
		}),
	};
}

async function emitFacts(
	container: Container,
	config: ResolvedConfig,
	projectRoot: string,
	detection: Detection | null,
): Promise<void> {
	if (config.output.facts === null || detection === null) {
		return;
	}
	const factsPath = path.resolve(projectRoot, config.output.facts);
	await container.writer.write(factsPath, detection.artifact);
	await container.writer.write(
		sidecarPathFor(factsPath),
		renderFactsSidecar({
			generatedAt: container.clock.nowIso(),
			buildDurationMs: container.clock.nowMs() - detection.startedMs,
			unitDigest: detection.unitDigest,
		}),
	);
	container.logger.info(
		`wrote ${factsPath} (${detection.factSet.facts.length} fact(s), ${detection.factSet.diagnostics.length} diagnostic(s))`,
	);
}

type CheckRequest = {
	readonly container: Container;
	readonly config: ResolvedConfig;
	readonly markdown: string;
	readonly mdPath: string;
	readonly detection: Detection | null;
	readonly projectRoot: string;
};

/**
 * Check mode writes no path. The document is compared modulo metadata; the
 * artifact is compared byte for byte, because it carries no timestamp.
 */
async function runCheck(request: CheckRequest): Promise<void> {
	const outcome = await artifactOutcome(request);
	if (outcome.code !== 0) {
		process.stderr.write(`${outcome.reason}\n`);
		process.exitCode = outcome.code;
		return;
	}
	const existing = (await request.container.reader.exists(request.mdPath))
		? await request.container.reader.read(request.mdPath)
		: "";
	if (stripMetadata(existing) === stripMetadata(request.markdown)) {
		request.container.logger.info("PROJECT_MAP.md is up to date.");
		return;
	}
	process.stderr.write("PROJECT_MAP.md is out of date.\n");
	process.exitCode = 1;
}

async function artifactOutcome(request: CheckRequest): Promise<CheckOutcome> {
	if (request.config.output.facts === null || request.detection === null) {
		return { code: 0 };
	}
	const factsPath = path.resolve(
		request.projectRoot,
		request.config.output.facts,
	);
	const committed = (await request.container.reader.exists(factsPath))
		? await request.container.reader.read(factsPath)
		: null;
	return checkFactsArtifact({
		committed,
		built: request.detection.artifact,
		analyzerBuildDigest: DETECTOR_SOURCE_DIGEST,
		registryDigest: DETECTOR_SOURCE_DIGEST,
		factSet: request.detection.factSet,
	});
}

/**
 * The digest of the analysis unit, printed and nothing else. A consumer that
 * needs to know whether detection would see a different tree asks for it
 * without producing an artifact to compare.
 */
function registerFactsCommand(program: Command): void {
	const command = program
		.command("facts")
		.description("Report the analysis unit detection would observe.")
		.option("--config <path>", "explicit path to .project-map.yaml")
		.option("--unit-digest", "print the analysis-unit digest", false)
		.option("--verbose", "verbose logging", false);

	command.action(async () => {
		const opts = command.opts<FactsOptions>();
		try {
			await reportUnitDigest(opts);
		} catch (error: unknown) {
			if (!(error instanceof ConfigTimeError)) {
				throw error;
			}
			process.stderr.write(`${error.message}\n`);
			process.exitCode = 5;
		}
	});
}

async function reportUnitDigest(opts: FactsOptions): Promise<void> {
	const container = createContainer(TOOL_VERSION, Boolean(opts.verbose));
	const config = await container.configLoader.load(
		process.cwd(),
		opts.config ?? null,
	);
	if (!config) {
		container.logger.error(
			"no .project-map.yaml found. Run `project-map init` to create one.",
		);
		process.exitCode = 2;
		return;
	}
	const unit = await analysisUnitMaterializer(container, null).materialize({
		cwd: process.cwd(),
		config,
		specLocators: config.openapi.serves.map((entry) => entry.spec),
		registryVersion: DETECTOR_SOURCE_DIGEST,
	});
	process.stdout.write(`${unit.digest}\n`);
}

function registerVersionCommand(program: Command): void {
	program
		.command("version")
		.description("Print tool version and supported languages.")
		.action(() => {
			const container = createContainer(TOOL_VERSION, false);
			const v = versionUseCase(container);
			process.stdout.write(v.render());
		});
}

function registerInstallGitHookCommand(program: Command): void {
	const command = program
		.command("install-git-hook")
		.description(
			"Install a git hook that gates commits/pushes on `build --check`.",
		)
		.option("--type <type>", "pre-push | pre-commit", "pre-push")
		.option("--force", "overwrite existing hook", false);

	command.action(async () => {
		const opts = command.opts<InstallGitHookOptions>();
		const container = createContainer(TOOL_VERSION, false);
		const useCase = installGitHookUseCase(container);
		if (opts.type !== "pre-push" && opts.type !== "pre-commit") {
			process.stderr.write(
				`invalid --type: ${opts.type}. Expected pre-push or pre-commit.\n`,
			);
			process.exitCode = 1;
			return;
		}
		const result = await useCase.execute({
			cwd: process.cwd(),
			type: opts.type,
			force: Boolean(opts.force),
		});
		if (!result.written) {
			process.exitCode = 1;
		}
	});
}

function registerClaudeCommand(program: Command): void {
	const claude = program
		.command("claude")
		.description(
			"Claude Code integration (UserPromptSubmit hook + /project-map skill).",
		);

	const install = claude
		.command("install")
		.description(
			"Install the UserPromptSubmit hook and the /project-map skill.",
		)
		.option("--scope <scope>", "project | user", "project")
		.option("--force", "reinstall even if already present", false)
		.option("--no-hook", "skip the UserPromptSubmit hook")
		.option("--no-skill", "skip the SKILL.md install");

	install.action(async () => {
		const opts = install.opts<ClaudeInstallOptions>();
		if (opts.scope !== "project" && opts.scope !== "user") {
			process.stderr.write(
				`invalid --scope: ${opts.scope}. Expected project or user.\n`,
			);
			process.exitCode = 1;
			return;
		}
		const scope = opts.scope;
		const force = Boolean(opts.force);
		const installHook = opts.hook !== false;
		const installSkill = opts.skill !== false;

		if (!installHook && !installSkill) {
			process.stderr.write(
				"nothing to install: both --no-hook and --no-skill passed.\n",
			);
			process.exitCode = 1;
			return;
		}

		const container = createContainer(TOOL_VERSION, false);
		const cwd = process.cwd();
		const results: Array<{ written: boolean; alreadyInstalled: boolean }> = [];

		if (installHook) {
			const hookResult = await installClaudeHookUseCase(container).execute({
				cwd,
				scope,
				force,
			});
			results.push(hookResult);
		}
		if (installSkill) {
			const skillResult = await installClaudeSkillUseCase(container).execute({
				cwd,
				scope,
				force,
			});
			results.push(skillResult);
		}

		const anyProgress = results.some((r) => r.written || r.alreadyInstalled);
		if (!anyProgress) {
			process.exitCode = 1;
		}
	});
}

function registerWatchCommand(program: Command): void {
	program
		.command("watch")
		.description("Not yet implemented — planned for v2.")
		.action(() => {
			process.stderr.write("watch mode is not yet implemented.\n");
			process.exitCode = 1;
		});
}

function applyOutputOverrides(
	cfg: Awaited<
		ReturnType<ReturnType<typeof createContainer>["configLoader"]["load"]>
	> &
		object,
	outArg: string | undefined,
	jsonArg: string | boolean | undefined,
): typeof cfg {
	const markdown = outArg ?? cfg.output.markdown;
	let json: string | null = cfg.output.json;
	if (jsonArg === true) {
		json = "project-map.json";
	} else if (typeof jsonArg === "string") {
		json = jsonArg;
	}
	return { ...cfg, output: { markdown, json, facts: cfg.output.facts } };
}

function applyOnly<T extends { sections: readonly SectionId[] }>(
	cfg: T,
	onlyArg: string | undefined,
): T {
	if (!onlyArg) {
		return cfg;
	}
	const requested = onlyArg
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const allowed = new Set<string>(requested);
	return { ...cfg, sections: SECTION_IDS.filter((s) => allowed.has(s)) };
}

function stripMetadata(content: string): string {
	return content
		.replace(/^Generated by project-map v.+$/m, "Generated by project-map")
		.replace(
			/^\| Build duration\s*\|.*\|$/m,
			"| Build duration | <normalized> |",
		);
}

function assertLanguage(value: string): Language {
	if (isLanguage(value)) {
		return value;
	}
	throw new Error(
		`invalid language: ${value}. Expected one of ${ALL_LANGUAGES.join(", ")}`,
	);
}

function isLanguage(value: string): value is Language {
	return (ALL_LANGUAGES as readonly string[]).includes(value);
}

function assertFramework(value: string): Framework {
	if (isFramework(value)) {
		return value;
	}
	throw new Error(
		`invalid framework: ${value}. Expected one of ${ALL_FRAMEWORKS.join(", ")}`,
	);
}

function isFramework(value: string): value is Framework {
	return (ALL_FRAMEWORKS as readonly string[]).includes(value);
}
