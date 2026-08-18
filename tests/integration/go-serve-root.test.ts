import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { routesOf } from "../support/facts.js";
import { diagnosticsOf } from "../support/operations.js";
import { createWorkspace, runCli } from "../support/workspace.js";

const ARTIFACT = ".project-map/facts.json";

async function built(fixture: string): Promise<string> {
	const workspace = await createWorkspace(fixture);
	onTestFinished(() => workspace.dispose());
	await runCli(workspace.dir, ["build"]);
	return workspace.dir;
}

describe("a router that reaches a declared serve root", () => {
	/* @covers project-map:BEH-019 */
	it("composes the declared mount with the proven chain", async () => {
		const dir = await built("go-chi-mount-const");

		expect(await routesOf(dir)).toEqual([
			{ method: "GET", path: "/v3/ping", resolution: "resolved" },
		]);
	});

	/* @covers project-map:BEH-019 */
	it("anchors through an entry point two edges from the construction", async () => {
		const dir = await built("go-serve-root-deep");

		expect(await routesOf(dir)).toEqual([
			{ method: "GET", path: "/api/v9/ping", resolution: "resolved" },
		]);
	});
});

describe("a router that reaches no declared serve root", () => {
	/* @covers project-map:DLT-041 */
	/* @covers project-map:DLT-040 */
	it("publishes no path rather than a bare one", async () => {
		const dir = await built("go-chi-unanchored");

		expect(await routesOf(dir)).toContainEqual({
			method: "GET",
			path: "{unknown:unanchored_router}",
			resolution: "unresolved",
		});
		expect((await routesOf(dir)).map((route) => route.path)).not.toContain(
			"/ping",
		);
	});

	/* @covers project-map:INV-005 */
	/* @covers project-map:DLT-041 */
	it("still claims the site it could not place", async () => {
		const dir = await built("go-chi-unanchored");

		expect(await diagnosticsOf(dir)).toContainEqual({
			code: "unanchored_router",
			callee: "github.com/go-chi/chi/v5.Get",
			count: 1,
		});
	});
});

describe("a serve root the unit does not hold", () => {
	/* @covers project-map:BEH-019 */
	it("raises a mandatory diagnostic", async () => {
		const dir = await built("go-serve-root-missing");

		expect(await diagnosticsOf(dir)).toContainEqual({
			code: "serve_root_unresolved",
			callee: "sample/missing.NoSuchRouter",
			count: 1,
		});
	});

	/* @covers project-map:BEH-019 */
	it("fails check mode on the code alone", async () => {
		const dir = await built("go-serve-root-missing");

		expect(await runCli(dir, ["build", "--check"])).toBe(4);
	});
});

describe("the anchored artifact", () => {
	/* @covers project-map:INV-003 */
	it("builds the same bytes twice", async () => {
		const dir = await built("go-serve-root-deep");
		const first = await readFile(path.join(dir, ARTIFACT), "utf8");

		await runCli(dir, ["build"]);

		expect(await readFile(path.join(dir, ARTIFACT), "utf8")).toBe(first);
	});
});
