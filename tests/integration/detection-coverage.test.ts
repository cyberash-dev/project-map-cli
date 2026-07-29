import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coverageOf, diagnosticsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("the candidate universe a diagnostic may come from", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-013 */
	it("merges one callee reached from three anchors into one diagnostic", async () => {
		const diagnostics = await diagnosticsOf(workspace.dir);
		const retries = diagnostics.filter(
			(entry) => entry.callee === "self.retry",
		);

		expect(retries).toHaveLength(1);
		expect(retries[0]?.count).toBe(3);
	});

	/* @covers project-map:BEH-013 */
	it("leaves a member the sink subclass itself declares outside the universe", async () => {
		const diagnostics = await diagnosticsOf(workspace.dir);

		expect(diagnostics.map((entry) => entry.callee)).not.toContain(
			"self._stamp",
		);
	});

	/* @covers project-map:BEH-013 */
	it("leaves the server half of a transport package outside the universe", async () => {
		const diagnostics = await diagnosticsOf(workspace.dir);

		expect(diagnostics.map((entry) => entry.callee)).not.toContain(
			"web.Response",
		);
	});

	/* @covers project-map:BEH-013 */
	it("reports inbound coverage unmeasured where no specification is served", async () => {
		const coverage = await coverageOf(workspace.dir);

		expect(coverage["inbound"]).toBe("unmeasured");
		expect(Object.keys(coverage)).not.toContain("inbound_declared");
	});

	/* @covers project-map:BEH-013 */
	it("counts the outbound facts it classified and the ones it resolved", async () => {
		const coverage = await coverageOf(workspace.dir);

		expect(coverage["outbound_classified"]).toBe(6);
		expect(coverage["outbound_resolved"]).toBe(5);
		expect(coverage["outbound_in_library"]).toBe(1);
	});
});

describe("coverage against a declared inventory", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("openapi-serves-minimal");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-013 */
	it("takes the declared inventory as the inbound denominator", async () => {
		const coverage = await coverageOf(workspace.dir);

		expect(coverage["inbound_declared"]).toBe(3);
		expect(coverage["inbound_registered_in_code"]).toBe(0);
		expect(coverage["inbound"]).toBeUndefined();
	});

	/* @covers project-map:BEH-013 */
	it("reports outbound unmeasured where nothing declares an outbound shape", async () => {
		const coverage = await coverageOf(workspace.dir);

		expect(coverage["outbound"]).toBe("unmeasured");
	});
});

describe("the shared-library halves and the coverage denominator", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-shared-consumer");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-012 */
	it("excludes a half deferred to the linker from the denominator", async () => {
		const coverage = await coverageOf(workspace.dir);

		expect(coverage["outbound_classified"]).toBe(1);
		expect(coverage["outbound_resolved"]).toBe(1);
		expect(coverage["outbound_in_library"]).toBe(3);
	});
});
