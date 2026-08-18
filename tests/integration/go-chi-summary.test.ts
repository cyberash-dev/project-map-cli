import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { diagnosticsOf, renderValue } from "../support/operations.js";
import { routesOf } from "../support/facts.js";
import { createWorkspace, runCli } from "../support/workspace.js";

const ARTIFACT = ".project-map/facts.json";

async function built(fixture: string): Promise<string> {
	const workspace = await createWorkspace(fixture);
	onTestFinished(() => workspace.dispose());
	await runCli(workspace.dir, ["build"]);
	return workspace.dir;
}

type Endpoint = { readonly path: string; readonly provenance: string };

function memberAt(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) {
		throw new Error(`expected a record carrying ${key}`);
	}
	return Reflect.get(value, key);
}

function arrayAt(value: unknown, key: string): unknown[] {
	const found = memberAt(value, key);
	if (!Array.isArray(found)) {
		throw new Error(`expected an array at ${key}`);
	}
	return found;
}

async function endpointsOf(dir: string): Promise<Endpoint[]> {
	const artifact: unknown = JSON.parse(
		await readFile(path.join(dir, ARTIFACT), "utf8"),
	);
	return arrayAt(artifact, "facts")
		.filter((fact) => memberAt(fact, "kind") === "endpoint")
		.map((fact) => ({
			path: renderValue(
				memberAt(
					memberAt(arrayAt(memberAt(fact, "operation"), "variants")[0], "http"),
					"path",
				),
			),
			provenance: arrayAt(fact, "provenance").join("+"),
		}));
}

describe("a router carried through one call edge", () => {
	/* @covers project-map:DLT-036 */
	it("composes the prefix the record carried it under", async () => {
		const dir = await built("go-chi-generated");

		expect(await endpointsOf(dir)).toContainEqual({
			path: "/pay/v1/screens/cart",
			provenance: "openapi+router",
		});
	});

	/* @covers project-map:DLT-036 */
	it("reads a string field the literal never assigned as its zero value", async () => {
		const dir = await built("go-chi-generated");

		expect((await endpointsOf(dir)).map((entry) => entry.path)).not.toContain(
			"/pay/v1/{unknown:dynamic}/screens/cart",
		);
	});

	/* @covers project-map:DLT-036 */
	it("lets the null-guarded branch contribute no router", async () => {
		const dir = await built("go-chi-generated");

		expect(await endpointsOf(dir)).toHaveLength(1);
	});

	/* @covers project-map:CTR-006 */
	it("merges the registration with the route the contract serves", async () => {
		const dir = await built("go-chi-generated");

		expect(await routesOf(dir)).toEqual([
			{ method: "POST", path: "/pay/v1/screens/cart", resolution: "resolved" },
		]);
	});
});

describe("a mount the analysis has to reach for", () => {
	/* @covers project-map:DLT-036 */
	/* @covers project-map:DLT-037 */
	it("composes a mount recorded in another file of the unit", async () => {
		const dir = await built("go-chi-cross-file");

		expect(await routesOf(dir)).toEqual([
			{ method: "GET", path: "/v2/orders", resolution: "resolved" },
		]);
	});

	/* @covers project-map:DLT-036 */
	it("folds a package constant named as the mount prefix", async () => {
		const dir = await built("go-chi-mount-const");

		expect(await routesOf(dir)).toEqual([
			{ method: "GET", path: "/v3/ping", resolution: "resolved" },
		]);
	});

	/* @covers project-map:DLT-037 */
	it("serves both routes of a helper reached from two mount points", async () => {
		const dir = await built("go-chi-helper-twice");

		expect((await routesOf(dir)).map((route) => route.path).sort()).toEqual([
			"/v1/orders",
			"/v2/orders",
		]);
	});
});

describe("what the summary refuses", () => {
	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-043 */
	it("carries a router two call edges from its construction", async () => {
		const dir = await built("go-chi-budget");

		expect(await routesOf(dir)).toEqual([
			{ method: "GET", path: "/v1/deep", resolution: "resolved" },
		]);
	});

	/* The long call is written first, so a walk that let a longer path stand
	 * would report this site unanchored whatever the shorter path proved. */
	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-044 */
	it("prefers the shorter path to a helper reached at two distances", async () => {
		const dir = await built("go-chi-shared-helper");

		expect(await routesOf(dir)).toEqual([
			{ method: "GET", path: "/v1/deep", resolution: "resolved" },
		]);
		expect(await diagnosticsOf(dir)).toEqual([]);
	});

	/* A chain the budget refused reaches no anchor, and project-map:DLT-041
	 * publishes no part of an unanchored chain, so the refusal is not
	 * separable from any other unproven link in the emitted path. */
	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-043 */
	it("publishes no path for a chain four edges out", async () => {
		const dir = await built("go-chi-over-budget");

		expect(await routesOf(dir)).toEqual([
			{
				method: "GET",
				path: "{unknown:unanchored_router}",
				resolution: "unresolved",
			},
		]);
	});

	/* @covers project-map:DLT-038 */
	it("diagnoses a mount whose sub-router did not resolve", async () => {
		const dir = await built("go-chi-mount-dropped");

		expect(await diagnosticsOf(dir)).toContainEqual({
			code: "router_mount_unresolved",
			callee: "github.com/go-chi/chi/v5.Mount",
			count: 1,
		});
		expect(await routesOf(dir)).toEqual([]);
	});

	/* @covers project-map:INV-003 */
	it("builds the same bytes twice", async () => {
		const dir = await built("go-chi-generated");
		const first = await readFile(path.join(dir, ARTIFACT), "utf8");

		await runCli(dir, ["build"]);

		expect(await readFile(path.join(dir, ARTIFACT), "utf8")).toBe(first);
	});
});
