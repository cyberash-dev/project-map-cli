import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { diagnosticsOf } from "../support/operations.js";
import { routesOf } from "../support/facts.js";
import { createWorkspace, runCli } from "../support/workspace.js";

const ARTIFACT = ".project-map/facts.json";

async function built(fixture: string): Promise<string> {
	const workspace = await createWorkspace(fixture);
	onTestFinished(() => workspace.dispose());
	await runCli(workspace.dir, ["build"]);
	return workspace.dir;
}

async function pathsOf(dir: string): Promise<string[]> {
	return (await routesOf(dir)).map((route) => route.path);
}

describe("what a serving call anchors", () => {
	/* @covers project-map:BEH-021 */
	it("anchors a collection the served class binds itself", async () => {
		const dir = await built("python-serve-anchor");

		expect(await routesOf(dir)).toContainEqual({
			method: "GET",
			path: "/api/form/v1/checkout",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-021 */
	it("anchors a collection reached through an inherited attribute", async () => {
		const dir = await built("python-serve-anchor");

		expect(await routesOf(dir)).toContainEqual({
			method: "GET",
			path: "/ping",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-021 */
	it("anchors a collection concatenated onto another class attribute", async () => {
		const dir = await built("python-serve-anchor");

		expect(await pathsOf(dir)).toContain("/internal/orders");
	});

	/* @covers project-map:BEH-021 */
	it("anchors a collection spliced into another by a splat", async () => {
		const dir = await built("python-serve-anchor");

		expect(await pathsOf(dir)).toContain("/api/cms/v1/retailcrm/config");
	});

	/* The combined application is bound in one branch and the badges one in
	 * the other, and each carries a collection the other never reaches. */
	/* @covers project-map:BEH-021 */
	it("serves every branch a binding takes rather than the first", async () => {
		const dir = await built("python-serve-anchor");

		const paths = await pathsOf(dir);
		expect(paths).toContain("/internal/orders");
		expect(paths).toContain("/ping");
	});

	/* @covers project-map:INV-003 */
	it("builds the same bytes twice", async () => {
		const dir = await built("python-serve-anchor");
		const first = await readFile(path.join(dir, ARTIFACT), "utf8");

		await runCli(dir, ["build"]);

		expect(await readFile(path.join(dir, ARTIFACT), "utf8")).toBe(first);
	});
});

describe("what a serving call leaves unanchored", () => {
	/* @covers project-map:DLT-045 */
	it("publishes no path for a collection no application holds", async () => {
		const dir = await built("python-serve-anchor");

		expect(await pathsOf(dir)).not.toContain("/orphan");
	});

	/* @covers project-map:BEH-021 */
	it("publishes no path for a base binding the served class rebinds", async () => {
		const dir = await built("python-serve-anchor");

		expect(await pathsOf(dir)).not.toContain("/legacy");
	});

	/* @covers project-map:DLT-045 */
	it("types the unanchored registrations rather than dropping them", async () => {
		const dir = await built("python-serve-anchor");

		expect(
			(await pathsOf(dir)).filter(
				(entry) => entry === "{unknown:unanchored_router}",
			),
		).toHaveLength(2);
	});

	/* @covers project-map:DLT-045 */
	it("raises one diagnostic for each registration reaching no anchor", async () => {
		const dir = await built("python-serve-anchor");

		expect(await diagnosticsOf(dir)).toContainEqual({
			code: "unanchored_router",
			callee: "routing_dsl.Url",
			count: 2,
		});
	});

	/* @covers project-map:BEH-021 */
	it("names the serving call whose application resolves nowhere", async () => {
		const dir = await built("python-serve-root-missing");

		expect(await diagnosticsOf(dir)).toContainEqual({
			code: "serve_root_unresolved",
			callee: "aiohttp.web.run_app",
			count: 1,
		});
		expect(await pathsOf(dir)).toEqual(["{unknown:unanchored_router}"]);
	});
});
