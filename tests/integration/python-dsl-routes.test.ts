import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

type Route = { readonly method: string; readonly path: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(value: unknown, key: string): string {
	if (!isRecord(value)) {
		throw new Error(`expected a record carrying ${key}`);
	}
	const found = value[key];
	if (typeof found !== "string") {
		throw new Error(`expected a string at ${key}`);
	}
	return found;
}

function memberAt(value: unknown, key: string): unknown {
	if (!isRecord(value)) {
		throw new Error(`expected a record carrying ${key}`);
	}
	return value[key];
}

function routeOf(fact: unknown): Route {
	const variants = memberAt(memberAt(fact, "operation"), "variants");
	if (!Array.isArray(variants)) {
		throw new Error("expected a variants array");
	}
	const http = memberAt(variants[0], "http");
	const method = memberAt(http, "method");
	return {
		method:
			stringAt(method, "kind") === "literal"
				? stringAt(method, "value")
				: `unknown(${stringAt(method, "reason")})`,
		path: stringAt(memberAt(http, "path"), "value"),
	};
}

async function routesOf(dir: string): Promise<Route[]> {
	const artifact: unknown = JSON.parse(
		await readFile(path.join(dir, ".project-map/facts.json"), "utf8"),
	);
	const facts = memberAt(artifact, "facts");
	if (!Array.isArray(facts)) {
		throw new Error("artifact carries no facts array");
	}
	return facts.map(routeOf);
}

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

		const routes = await routesOf(workspace.dir);
		expect(routes).toContainEqual({ method: "GET", path: "/ping" });
	});

	/* @covers project-map:BEH-008 */
	it("takes the verb a handler inherits across two modules", async () => {
		await runCli(workspace.dir, ["build"]);

		const routes = await routesOf(workspace.dir);
		expect(routes).toContainEqual({
			method: "POST",
			path: "/api/merchant/v1/orders/{}",
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

		const routes = await routesOf(workspace.dir);
		expect(routes).toContainEqual({ method: "DELETE", path: "/decorated" });
	});

	/* @covers project-map:BEH-008 */
	it("applies configured selectors to non-default argument positions", async () => {
		await runCli(workspace.dir, ["build"]);

		const routes = await routesOf(workspace.dir);
		expect(routes).toContainEqual({ method: "GET", path: "/shifted" });
	});

	/* @covers project-map:BEH-008 */
	it("emits exactly the routes the fixture declares", async () => {
		await runCli(workspace.dir, ["build"]);

		expect(await routesOf(workspace.dir)).toHaveLength(4);
	});
});
