import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routesOf } from "../support/facts.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("python declaration-DSL routes", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-dsl-routes");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-008 */
	it("composes the prefix a local subclass declares", async () => {
		await runCli(workspace.dir, ["build"]);

		const routes = await routesOf(workspace.dir);
		expect(routes.map((route) => route.path)).toContain(
			"/api/merchant/v1/orders/{}",
		);
	});

	/* @covers project-map:BEH-008 */
	it("registers a route through the unprefixed form of the same DSL", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "GET",
			path: "/ping",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-008 */
	it("takes the verb a handler inherits across two modules", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "POST",
			path: "/api/merchant/v1/orders/{}",
			resolution: "resolved",
		});
	});

	/* @covers project-map:INV-004 */
	it("emits nothing for a class that shares the DSL name and originates elsewhere", async () => {
		await runCli(workspace.dir, ["build"]);

		const routes = await routesOf(workspace.dir);
		expect(routes.map((route) => route.path)).not.toContain("/not-a-route");
	});

	/* @covers project-map:INV-004 */
	it("emits nothing for a header accessor that shares a member name", async () => {
		await runCli(workspace.dir, ["build"]);

		const routes = await routesOf(workspace.dir);
		expect(routes.map((route) => route.path)).not.toContain("X-Merchant-ID");
	});

	/* @covers project-map:BEH-008 */
	it("takes the verb of a decorated member", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "DELETE",
			path: "/decorated",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-008 */
	it("applies configured selectors to non-default argument positions", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "GET",
			path: "/shifted",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-008 */
	it("emits exactly the routes the fixture declares", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toHaveLength(4);
	});
});
