import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnosticsOf, operationsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const ARTIFACT = ".project-map/facts.json";

describe("a proof path bounded by its budget", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-proof-budget");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-007 */
	it("resolves a path three def-use edges from the call", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "BudgetClient.near"),
		).toMatchObject({ path: "/api/v1/near/{}", resolution: "resolved" });
	});

	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-035 */
	it("types a fourth def-use edge as an exhausted budget", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "BudgetClient.deep")?.path,
		).toBe("/{unknown:depth_exceeded}");
	});

	/* @covers project-map:INV-005 */
	it("emits the site the budget stopped short on", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "BudgetClient.deep"),
		).toMatchObject({
			provenance: "declared",
			method: "POST",
			destinations: ["config(settings.conf:BUDGET_API_URL)"],
			resolution: "unresolved",
		});
	});
});

describe("a proof path that closes on itself", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-proof-recursive");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-035 */
	it("terminates on a self-referential binding", async () => {
		expect(await runCli(workspace.dir, ["build"])).toBe(0);
	});

	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-035 */
	it("types the path it could not leave as recursive", async () => {
		await runCli(workspace.dir, ["build"]);

		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "LoopingClient.refresh")?.path,
		).toBe("/{unknown:recursive}");
	});

	/* @covers project-map:INV-005 */
	/* @covers project-map:BEH-010 */
	it("emits the site rather than dropping it", async () => {
		await runCli(workspace.dir, ["build"]);

		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "LoopingClient.refresh"),
		).toMatchObject({
			provenance: "declared",
			method: "POST",
			destinations: ["config(settings.conf:LOOPING_API_URL)"],
		});
		expect(await diagnosticsOf(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:INV-003 */
	it("builds the same bytes twice", async () => {
		await runCli(workspace.dir, ["build"]);
		const first = await readFile(path.join(workspace.dir, ARTIFACT), "utf8");

		await runCli(workspace.dir, ["build"]);

		expect(await readFile(path.join(workspace.dir, ARTIFACT), "utf8")).toBe(
			first,
		);
	});
});
