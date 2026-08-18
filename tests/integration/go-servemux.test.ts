import { describe, expect, it, onTestFinished } from "vitest";
import { routesOf } from "../support/facts.js";
import { createWorkspace, runCli } from "../support/workspace.js";

async function built(fixture: string): Promise<string> {
	const workspace = await createWorkspace(fixture);
	onTestFinished(() => workspace.dispose());
	await runCli(workspace.dir, ["build"]);
	return workspace.dir;
}

describe("the standard-library multiplexer", () => {
	/* @covers project-map:BEH-020 */
	it("answers a GET pattern on both GET and HEAD", async () => {
		const routes = await routesOf(await built("go-servemux"));

		expect(routes).toContainEqual({
			method: "GET",
			path: "/items/{}",
			resolution: "resolved",
		});
		expect(routes).toContainEqual({
			method: "HEAD",
			path: "/items/{}",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-020 */
	it("leaves a method-less pattern typed rather than expanding it", async () => {
		const routes = await routesOf(await built("go-servemux"));

		expect(routes).toContainEqual({
			method: "{unknown:dynamic}",
			path: "/legacy",
			resolution: "unresolved",
		});
	});

	/* A host-carrying pattern names a route the path alone does not, so the
	 * path component is typed while the declared mount above it stands. */
	/* @covers project-map:BEH-020 */
	it("types the path of a pattern that names a host", async () => {
		const routes = await routesOf(await built("go-servemux"));

		expect(routes.map((route) => route.path)).toContain("/{unknown:dynamic}");
		expect(routes.map((route) => route.path)).not.toContain("/hosted");
	});

	/* @covers project-map:BEH-020 */
	it("mounts a multiplexer handed to a pattern as a handler", async () => {
		const routes = await routesOf(await built("go-servemux"));

		expect(routes).toContainEqual({
			method: "POST",
			path: "/api/reports",
			resolution: "resolved",
		});
	});
});
