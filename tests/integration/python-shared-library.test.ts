import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operationsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("the library half of a shared-library operation", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-shared-library");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-012 */
	it("carries the join key on every operation member of the declared type", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find(
				(entry) => entry.owner === "AbstractSplitClient.get_order",
			),
		).toMatchObject({ moduleId: "lib.split", callee: "get_order" });
		expect(
			operations.find(
				(entry) => entry.owner === "AbstractSplitClient.create_order",
			),
		).toMatchObject({ moduleId: "lib.split", callee: "create_order" });
	});

	/* @covers project-map:BEH-012 */
	it("types a destination the library itself does not bind as a library root", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find(
				(entry) => entry.owner === "AbstractSplitClient.get_order",
			),
		).toMatchObject({
			destinations: ["{unknown:operation_in_library_root}"],
			path: "/orders/{}",
			method: "GET",
		});
	});

	/* @covers project-map:BEH-012 */
	it("leaves the join key null on a type carrying no module id", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "AuditClient.record"),
		).toMatchObject({
			moduleId: null,
			callee: null,
			destinations: ["https://audit.internal"],
		});
	});

	/* @covers project-map:BEH-012 */
	it("anchors the library callee at the member declaration", async () => {
		const operations = await operationsOf(workspace.dir);
		const declaration = operations.find(
			(entry) => entry.owner === "AbstractSplitClient.get_order",
		)?.calleeDeclaration;
		const source = await readFile(
			path.join(workspace.dir, "lib/split/client.py"),
			"utf8",
		);

		expect(declaration?.path).toBe("lib/split/client.py");
		expect(
			source.slice(declaration?.start_byte, declaration?.end_byte),
		).toContain("async def get_order");
	});
});

describe("the consumer half of a shared-library operation", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-shared-consumer");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-012 */
	it("names the module and the member a registry access reaches", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "GetOrder.run"),
		).toMatchObject({
			moduleId: "lib.split",
			callee: "get_order",
			method: "{unknown:operation_in_library}",
			path: "{unknown:operation_in_library}",
		});
	});

	/* @covers project-map:BEH-012 */
	it("resolves the destination the consumer declares locally", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "GetOrder.run"),
		).toMatchObject({
			destinations: ["config(settings.conf:SPLIT_API_URL)"],
			bindings: ["owner_declaration"],
		});
	});

	/* @covers project-map:BEH-012 */
	it("keeps a target living only in the library unresolved", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "RecordAudit.run"),
		).toMatchObject({
			moduleId: "lib.audit",
			callee: "record",
			destinations: ["{unknown:operation_in_library_root}"],
		});
	});

	/* @covers project-map:BEH-012 */
	it("types a dynamically selected member as unknown", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "DynamicOperation.run"),
		).toMatchObject({ moduleId: "lib.split", callee: "{unknown:dynamic}" });
	});

	/* @covers project-map:BEH-012 */
	it("leaves an ordinary sink call without a join key", async () => {
		const operations = await operationsOf(workspace.dir);

		expect(
			operations.find((entry) => entry.owner === "LedgerClient.append"),
		).toMatchObject({
			moduleId: null,
			callee: null,
			provenance: "declared",
			path: "/ledger",
		});
	});

	/* @covers project-map:DLT-014 */
	it("anchors the consumer callee at the member access that names it", async () => {
		const operations = await operationsOf(workspace.dir);
		const declaration = operations.find(
			(entry) => entry.owner === "GetOrder.run",
		)?.calleeDeclaration;
		const source = await readFile(
			path.join(workspace.dir, "actions/orders.py"),
			"utf8",
		);

		expect(declaration?.path).toBe("actions/orders.py");
		expect(source.slice(declaration?.start_byte, declaration?.end_byte)).toBe(
			"self.clients.split.get_order",
		);
	});
});
