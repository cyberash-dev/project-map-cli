import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../../src/core/ports/config.port.js";
import { CosmiconfigLoader } from "../../src/infrastructure/config/loader.js";
import { createWorkspace, type Workspace } from "../support/workspace.js";

const HEAD = [
	"project:",
	"  name: one",
	"  language: python",
	"repository_identity: sample/one",
	"",
].join("\n");

async function loadYaml(dir: string, yaml: string): Promise<ResolvedConfig> {
	await writeFile(path.join(dir, ".project-map.yaml"), yaml, "utf8");
	const config = await new CosmiconfigLoader().load(dir, null);
	if (!config) {
		throw new Error("config did not load");
	}
	return config;
}

const ROUTER = [
	"detect:",
	"  inbound:",
	"    routers:",
	'      - dsl: "sendr_aiohttp.PrefixedUrl"',
	"        path_arg: { kind: arg, selector: 0 }",
	'        prefix_from: { kind: class_const, selector: "PREFIX" }',
	"        verb_from:",
	"          kind: handler_methods",
	"          handler: { kind: arg, selector: 1 }",
	"",
].join("\n");

describe("detect configuration", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-005 */
	it("resolves a declared inbound router", async () => {
		const config = await loadYaml(workspace.dir, HEAD + ROUTER);

		const router = config.detect.inbound.routers[0];
		expect(router?.dsl).toBe("sendr_aiohttp.PrefixedUrl");
		expect(router?.pathArg).toEqual([{ kind: "arg", selector: 0 }]);
		expect(router?.prefixFrom).toEqual([
			{ kind: "class_const", selector: "PREFIX" },
		]);
	});

	/* @covers project-map:CTR-005 */
	it("reads a single selector step as a one-element chain", async () => {
		const config = await loadYaml(workspace.dir, HEAD + ROUTER);

		expect(config.detect.inbound.routers[0]?.pathArg).toHaveLength(1);
	});

	/* @covers project-map:CTR-005 */
	it("reads a selector chain left to right", async () => {
		const chained = ROUTER.replace(
			"path_arg: { kind: arg, selector: 0 }",
			'path_arg: [{ kind: arg, selector: 0 }, { kind: field, selector: "APIMethod" }]',
		);

		const config = await loadYaml(workspace.dir, HEAD + chained);

		expect(config.detect.inbound.routers[0]?.pathArg).toEqual([
			{ kind: "arg", selector: 0 },
			{ kind: "field", selector: "APIMethod" },
		]);
	});

	/* @covers project-map:CTR-005 */
	it("defaults both detection sections to empty", async () => {
		const config = await loadYaml(workspace.dir, HEAD);

		expect(config.detect.inbound.routers).toEqual([]);
		expect(config.detect.outbound.sinks).toEqual([]);
	});
});

describe("selector grammar rejection", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-005 */
	it("rejects a glob in a selector", async () => {
		const globbed = ROUTER.replace('selector: "PREFIX"', 'selector: "PRE*"');

		await expect(loadYaml(workspace.dir, HEAD + globbed)).rejects.toThrow(
			/selector/,
		);
	});

	/* @covers project-map:CTR-005 */
	it("rejects a character class in a selector", async () => {
		const classed = ROUTER.replace(
			'selector: "PREFIX"',
			'selector: "PREFI[XY]"',
		);

		await expect(loadYaml(workspace.dir, HEAD + classed)).rejects.toThrow(
			/selector/,
		);
	});

	/* @covers project-map:CTR-005 */
	it("rejects a property path that expresses a positional index", async () => {
		const positional = ROUTER.replace(
			'prefix_from: { kind: class_const, selector: "PREFIX" }',
			'prefix_from: { kind: property-path, selector: "0.PREFIX" }',
		);

		await expect(loadYaml(workspace.dir, HEAD + positional)).rejects.toThrow(
			/selector/,
		);
	});

	/* @covers project-map:CTR-005 */
	it("rejects a step kind outside the closed set", async () => {
		const invented = ROUTER.replace(
			"kind: arg, selector: 0",
			"kind: regex, selector: 0",
		);

		await expect(loadYaml(workspace.dir, HEAD + invented)).rejects.toThrow();
	});
});
