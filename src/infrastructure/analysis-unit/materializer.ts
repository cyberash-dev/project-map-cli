import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import * as path from "node:path";
import { ConfigTimeError } from "../../core/domain/config-time-error.js";
import { extensionsFor } from "../../core/domain/language.js";
import type {
	AnalysisUnit,
	IAnalysisUnitMaterializer,
	MaterializeRequest,
	UnitDocument,
	UnitSource,
} from "../../core/ports/analysis-unit.port.js";
import type { ResolvedConfig } from "../../core/ports/config.port.js";
import type {
	IFileReader,
	IFileWalker,
} from "../../core/ports/filesystem.port.js";
import { jcs } from "../../features/detect/canonical/jcs.js";
import { readSourceSet } from "./read-sources.js";

const UNIT_SCHEMA = "project-map/analysis-unit/1";
const REPO_TAG = "repo:";
const MONOREPO_TAG = "monorepo:";

export type MaterializerDeps = {
	readonly walker: IFileWalker;
	readonly reader: IFileReader;
	readonly monorepoRoot: string | null;
};

/**
 * The one place that reads the filesystem for detection. Everything past it
 * sees a finite path-to-text map and no absolute path, which is what makes a
 * checkout at another location produce identical bytes.
 */
export class FilesystemAnalysisUnitMaterializer implements IAnalysisUnitMaterializer {
	constructor(private readonly deps: MaterializerDeps) {}

	async materialize(request: MaterializeRequest): Promise<AnalysisUnit> {
		const { config } = request;
		const projectRoot = path.resolve(request.cwd, config.root);
		const declarationRoot = declarationRootOf(request.cwd, config);

		const sources = await this.readSources(projectRoot, config);
		const configDocuments = await this.readDeclarations(
			declarationRoot,
			config.analysisUnit.configDeclarations,
		);
		const specs = await this.readSpecs(declarationRoot, request.specLocators);

		return {
			repositoryIdentity: config.repositoryIdentity ?? "",
			sources,
			configDocuments,
			specs,
			registryVersion: request.registryVersion,
			digest: unitDigest({
				config,
				registryVersion: request.registryVersion,
				sources,
				configDocuments,
				specs,
			}),
		};
	}

	private async readSources(
		projectRoot: string,
		config: ResolvedConfig,
	): Promise<readonly UnitSource[]> {
		const declared = config.analysisUnit.sources;
		const include =
			declared.include.length > 0
				? declared.include
				: extensionsFor(config.project.language).map((ext) => `**/*${ext}`);
		const exclude =
			declared.exclude.length > 0 ? declared.exclude : config.exclude;

		return readSourceSet({
			walker: this.deps.walker,
			reader: this.deps.reader,
			selection: {
				root: projectRoot,
				include,
				exclude,
				respectGitignore: config.respectGitignore,
			},
		});
	}

	private async readDeclarations(
		declarationRoot: string,
		patterns: readonly string[],
	): Promise<readonly UnitDocument[]> {
		if (patterns.length === 0) {
			return [];
		}
		const discovered = await this.deps.walker.walk({
			root: declarationRoot,
			include: patterns,
			exclude: [],
		});
		const documents: UnitDocument[] = [];
		for (const file of discovered) {
			documents.push({
				locator: file.relPath,
				text: await this.deps.reader.read(file.absPath),
			});
		}
		return documents;
	}

	private async readSpecs(
		declarationRoot: string,
		locators: readonly string[],
	): Promise<readonly UnitDocument[]> {
		const documents: UnitDocument[] = [];
		for (const locator of [...locators].sort()) {
			const absPath = await this.resolveLocator(declarationRoot, locator);
			documents.push({
				locator,
				text: await this.deps.reader.read(absPath),
			});
		}
		return documents;
	}

	private async resolveLocator(
		declarationRoot: string,
		locator: string,
	): Promise<string> {
		if (locator.startsWith(MONOREPO_TAG)) {
			if (this.deps.monorepoRoot === null) {
				throw new ConfigTimeError(
					"monorepo_root_unresolved",
					`monorepo_root_unresolved: ${locator} needs a monorepo root supplied to the CLI`,
				);
			}
			return anchor(this.deps.monorepoRoot, locator.slice(MONOREPO_TAG.length));
		}
		if (locator.startsWith(REPO_TAG)) {
			return anchor(declarationRoot, locator.slice(REPO_TAG.length));
		}
		throw new ConfigTimeError(
			"spec_locator_outside_repo",
			`spec_locator_outside_repo: ${locator} carries no repo: or monorepo: tag`,
		);
	}
}

/**
 * Locators and config declarations anchor to the directory holding the
 * configuration file, not to `root`: both routinely sit beside the scanned
 * tree rather than inside it.
 */
function declarationRootOf(cwd: string, config: ResolvedConfig): string {
	return config.sourcePath === null
		? path.resolve(cwd, config.root)
		: path.dirname(config.sourcePath);
}

async function anchor(root: string, relative: string): Promise<string> {
	const resolved = path.resolve(root, relative);
	assertInside(root, resolved, relative);
	await assertNoSymlinkEscape(root, resolved, relative);
	return resolved;
}

function assertInside(root: string, resolved: string, locator: string): void {
	const offset = path.relative(root, resolved);
	if (offset.startsWith("..") || path.isAbsolute(offset)) {
		throw new ConfigTimeError(
			"spec_locator_outside_repo",
			`spec_locator_outside_repo: ${locator} resolves outside its anchored root`,
		);
	}
}

async function assertNoSymlinkEscape(
	root: string,
	resolved: string,
	locator: string,
): Promise<void> {
	const realRoot = await realpath(root);
	const realTarget = await realpathOrNull(resolved);
	if (realTarget === null) {
		return;
	}
	assertInside(realRoot, realTarget, locator);
}

async function realpathOrNull(target: string): Promise<string | null> {
	try {
		return await realpath(target);
	} catch {
		return null;
	}
}

type DigestInput = {
	readonly config: ResolvedConfig;
	readonly registryVersion: string;
	readonly sources: readonly UnitSource[];
	readonly configDocuments: readonly UnitDocument[];
	readonly specs: readonly UnitDocument[];
};

function unitDigest(input: DigestInput): string {
	const preimage = jcs([
		UNIT_SCHEMA,
		input.config.repositoryIdentity ?? "",
		input.config.unitConfigHash,
		input.registryVersion,
		input.sources.map((source) => [source.path, sha256(source.text)]),
		input.configDocuments.map((doc) => [doc.locator, sha256(doc.text)]),
		input.specs.map((doc) => [doc.locator, sha256(doc.text)]),
	]);
	return `sha256:${sha256(preimage)}`;
}

function sha256(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}
