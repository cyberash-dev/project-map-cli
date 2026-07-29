import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operationsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("outbound calls whose sending member takes a record", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("go-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-010 */
	it("claims a receiver that embeds the declared base type", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Client.CreateRepayment"),
		).toMatchObject({
			provenance: "declared",
			method: "POST",
			path: "/repayment/create",
		});
	});

	/* @covers project-map:BEH-010 */
	it("reads a field the caller wrote after the record was bound", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Client.ListRepayments")?.path,
		).toBe("/repayment/list");
	});

	/* @covers project-map:INV-005 */
	it("keeps the field a constructor bound and no caller overwrote", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Client.ListRepayments"),
		).toMatchObject({ method: "GET", resolution: "resolved" });
	});

	/* @covers project-map:INV-005 */
	it("emits a claimed site whose path stayed unproven", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Client.Untraceable"),
		).toMatchObject({
			method: "GET",
			path: "/{unknown:dynamic}",
			resolution: "unresolved",
		});
	});

	/* @covers project-map:BEH-011 */
	it("takes the destination from the factory that constructs the owning type", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Client.CreateRepayment"),
		).toMatchObject({
			bindings: ["owner_construction"],
			destinations: ["config(wiring.AppConfig:Debts)"],
		});
	});

	/* @covers project-map:BEH-010 */
	it("emits exactly the sending members the sink declares", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(operations).toHaveLength(3);
	});
});
