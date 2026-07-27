import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_LANGUAGES } from "../../src/core/domain/language.js";
import type {
	BoundedContext,
	Worker,
} from "../../src/core/domain/project-map.js";
import type { ResolvedConfig } from "../../src/core/ports/config.port.js";
import type { IExtractor } from "../../src/features/build/extractor.port.js";
import { BuildProjectMapUseCase } from "../../src/features/build/build.use-case.js";
import {
	defaultExtractors,
	type ExtractorSet,
} from "../../src/features/build/extractor-set.js";
import { SystemClock } from "../../src/infrastructure/clock/system.js";
import { CosmiconfigLoader } from "../../src/infrastructure/config/loader.js";
import { GlobbyWalker } from "../../src/infrastructure/filesystem/globby-walker.js";
import { NodeFileReader } from "../../src/infrastructure/filesystem/node-fs.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";
import { GitRevisionProvider } from "../../src/infrastructure/revision/git.js";
import { createWorkspace, type Workspace } from "../support/workspace.js";

const FIXTURE = "python-aiohttp-minimal";
const logger = new ConsoleLogger(false);

function failing<T>(name: string, delayMs: number): IExtractor<T> {
	return {
		name,
		extract: () =>
			new Promise<T>((_resolve, reject) => {
				setTimeout(() => reject(new Error(`${name} blew up`)), delayMs);
			}),
	};
}

async function buildWith(
	dir: string,
	config: ResolvedConfig,
	extractors: ExtractorSet,
) {
	return await new BuildProjectMapUseCase({
		config,
		walker: new GlobbyWalker(),
		reader: new NodeFileReader(),
		parser: new TreeSitterParserRegistry(ALL_LANGUAGES, logger),
		clock: new SystemClock(),
		logger,
		revision: new GitRevisionProvider(),
		toolVersion: "test",
		extractors,
	}).execute(dir);
}

describe("determinism conformance", () => {
	let workspace: Workspace;
	let config: ResolvedConfig;

	beforeEach(async () => {
		workspace = await createWorkspace(FIXTURE);
		const loaded = await new CosmiconfigLoader().load(workspace.dir, null);
		if (!loaded) {
			throw new Error("fixture config missing");
		}
		config = loaded;
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:INV-001 */
	/* @covers project-map:BEH-004 */
	it("orders multiple extraction errors independently of completion order", async () => {
		const base = defaultExtractors();
		const slow = await buildWith(workspace.dir, config, {
			...base,
			workers: failing<Worker[]>("workers", 30),
			contexts: failing<BoundedContext[]>("contexts", 0),
		});
		const reversed = await buildWith(workspace.dir, config, {
			...base,
			workers: failing<Worker[]>("workers", 0),
			contexts: failing<BoundedContext[]>("contexts", 30),
		});

		expect(slow.map.metadata.errors.map((e) => e.section)).toEqual([
			"contexts",
			"workers",
		]);
		expect(reversed.map.metadata.errors).toEqual(slow.map.metadata.errors);
	});
});
