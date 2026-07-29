import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routesOf } from "../support/facts.js";
import { diagnosticsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("go router value identity", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("go-chi-routes");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-009 */
	it("attributes a registration to the value its receiver was constructed from", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "GET",
			path: "/v1/ping",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-009 */
	it("carries the identity through a declared identity-preserving member", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "POST",
			path: "/v1/orders",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-009 */
	it("attributes a grouping closure that shadows the name to the outer router", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "DELETE",
			path: "/v1/orders/{}",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-009 */
	it("mounts a sub-router the built-in routing member derives", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "GET",
			path: "/admin/health",
			resolution: "resolved",
		});
	});

	/* @covers project-map:BEH-009 */
	it("types a router reached through an undeclared helper rather than placing it", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toContainEqual({
			method: "GET",
			path: "/{unknown:dynamic}/loose",
			resolution: "unresolved",
		});
	});

	/* @covers project-map:INV-004 */
	it("emits nothing for a same-named member on a receiver that is not a router", async () => {
		await runCli(workspace.dir, ["build"]);

		const routes = await routesOf(workspace.dir);
		expect(routes.map((route) => route.path)).not.toContain("/X-Token");
	});

	/* @covers project-map:BEH-009 */
	it("emits exactly the registrations the fixture reaches", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toHaveLength(5);
	});
});

describe("a router member that names no route", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("go-chi-routes");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-013 */
	it("diagnoses a router member no tier classifies, merged across anchors", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await diagnosticsOf(workspace.dir)).toContainEqual({
			code: "external_registration_unclassified",
			callee: "github.com/go-chi/chi/v5.NotFound",
			count: 2,
		});
	});

	/* @covers project-map:BEH-013 */
	it("emits no registration diagnostic for a receiver that is not a router", async () => {
		await runCli(workspace.dir, ["build"]);

		const diagnostics = await diagnosticsOf(workspace.dir);
		expect(diagnostics.map((entry) => entry.callee)).not.toContain(
			"github.com/go-chi/chi/v5.Get",
		);
	});
});
