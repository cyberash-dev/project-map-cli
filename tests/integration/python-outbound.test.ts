import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnosticsOf, operationsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("the outbound classification ladder", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-010 */
	it("claims a call into a declared generated module for the generated tier", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "GeneratedCaller.fetch")
				?.provenance,
		).toBe("generated");
	});

	/* @covers project-map:BEH-010 */
	it("claims a sending member of a transport package for the transport tier", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Reporter.publish"),
		).toMatchObject({ provenance: "transport", method: "POST" });
	});

	/* @covers project-map:BEH-010 */
	it("claims a sending member of a declared sink for the declared tier", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "OrdersClient.create_order"),
		).toMatchObject({ provenance: "declared", method: "POST" });
	});

	/* @covers project-map:BEH-010 */
	it("emits no fact for a request that reaches no sending call", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.filter((entry) => entry.owner === "Reporter.build_only"),
		).toHaveLength(0);
	});

	/* @covers project-map:BEH-010 */
	it("emits exactly one fact for a construction paired with a send", async () => {
		const operations = await operationsOf(workspace.dir);
		const sent = operations.filter(
			(entry) => entry.owner === "Reporter.build_then_send",
		);

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ method: "DELETE", path: "/v1/draft" });
	});

	/* @covers project-map:BEH-010 */
	/* @covers project-map:BEH-013 */
	it("diagnoses an unclassified callee inside the candidate universe", async () => {
		const diagnostics = await diagnosticsOf(workspace.dir);

		expect(diagnostics).toContainEqual({
			code: "external_call_unclassified",
			callee: "self.trace",
			count: 1,
		});
	});

	/* @covers project-map:INV-004 */
	it("emits neither a fact nor a diagnostic outside the universe", async () => {
		const operations = await operationsOf(workspace.dir);
		const diagnostics = await diagnosticsOf(workspace.dir);

		expect(operations.map((entry) => entry.owner)).not.toContain(
			"Ledger.total",
		);
		expect(diagnostics.map((entry) => entry.callee)).not.toContain(
			"self.rows.get",
		);
	});
});

describe("the destination of an HTTP outbound variant", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-011 */
	it("takes the target from the construction the receiver resolves to", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "notify_one"),
		).toMatchObject({
			bindings: ["instance"],
			destinations: ["config(settings.conf:TENANT_ONE_URL)"],
		});
	});

	/* @covers project-map:BEH-011 */
	it("combines every construction of the enclosing type as correlated variants", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "TenantClient.notify"),
		).toMatchObject({
			bindings: ["owner_construction", "owner_construction"],
			destinations: [
				"config(settings.conf:TENANT_ONE_URL)",
				"config(settings.conf:TENANT_TWO_URL)",
			],
			resolution: "ambiguous",
		});
	});

	/* @covers project-map:BEH-011 */
	it("falls to the declaration when no construction binds the selector", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "OrdersClient.create_order"),
		).toMatchObject({
			bindings: ["owner_declaration"],
			destinations: ["config(settings.conf:ORDERS_API_URL)"],
		});
	});

	/* @covers project-map:BEH-011 */
	it("types a hard-coded absolute URL as a literal destination", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "Reporter.publish"),
		).toMatchObject({
			destinations: ["https://reports.example"],
			path: "/v1/publish",
		});
	});
});

describe("the declared path-composing member", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-012 */
	it("folds the path from the declared helper's argument", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "OrdersClient.create_order")
				?.path,
		).toBe("/api/v1/orders");
	});

	/* @covers project-map:DLT-012 */
	it("keeps the target as the destination rather than a path segment", async () => {
		const operations = await operationsOf(workspace.dir);
		const created = operations.find(
			(entry) => entry.owner === "OrdersClient.create_order",
		);

		expect(created?.path).not.toContain("ORDERS_API_URL");
		expect(created?.destinations).toEqual([
			"config(settings.conf:ORDERS_API_URL)",
		]);
	});

	/* @covers project-map:DLT-012 */
	it("reduces an interpolated path segment to a positional hole", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "OrdersClient.read_order")
				?.path,
		).toBe("/api/v1/orders/{}");
	});

	/* @covers project-map:INV-005 */
	it("emits every claimed site, unresolved fields included", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(operations).toHaveLength(8);
		expect(
			operations.find((entry) => entry.owner === "GeneratedCaller.fetch"),
		).toMatchObject({
			method: "{unknown:operation_in_library}",
			resolution: "unresolved",
		});
	});
});
