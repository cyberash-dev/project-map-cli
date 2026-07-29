import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const FACTS = ".project-map/facts.json";
const JSON_DOCUMENT = "project-map.json";
const SIDECAR = ".project-map/facts.meta.json";

async function artifactOf(dir: string): Promise<string> {
	return readFile(path.join(dir, FACTS), "utf8");
}

function normativeRecord(document: string, recordId: string): string {
	const recordStart = document.indexOf(`id: ${recordId}\n`);
	if (recordStart === -1) {
		throw new Error(`Normative record not found: ${recordId}`);
	}
	const recordEnd = document.indexOf("\n---", recordStart);
	if (recordEnd === -1) {
		throw new Error(`Normative record is not terminated: ${recordId}`);
	}
	return document.slice(recordStart, recordEnd);
}

describe("facts artifact emission", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("openapi-serves-minimal");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-005 */
	/* @covers project-map:GA-002 */
	it("writes the artifact and its sidecar where a facts path is configured", async () => {
		const code = await runCli(workspace.dir, ["build"]);

		expect(code).toBe(0);
		const written = await listFiles(workspace.dir);
		expect(written).toContain(FACTS);
		expect(written).toContain(SIDECAR);
	});

	/* @covers project-map:POL-001 */
	/* @covers project-map:DLT-008 */
	it("bounds the write set to four paths where a facts path is configured", async () => {
		const before = await listFiles(workspace.dir);

		await runCli(workspace.dir, ["build"]);

		const added = (await listFiles(workspace.dir)).filter(
			(entry) => !before.includes(entry),
		);
		expect(added.sort()).toEqual(
			[FACTS, JSON_DOCUMENT, SIDECAR, "PROJECT_MAP.md"].sort(),
		);
	});

	/* @covers project-map:BEH-005 */
	/* @covers project-map:POL-001 */
	/* @covers project-map:DLT-008 */
	it("writes neither file where no facts path is configured", async () => {
		const config = path.join(workspace.dir, ".project-map.yaml");
		const text = await readFile(config, "utf8");
		await writeFile(config, text.replace(/\n {2}facts: .*\n/, "\n"), "utf8");

		await runCli(workspace.dir, ["build"]);

		const written = await listFiles(workspace.dir);
		expect(written).not.toContain(FACTS);
		expect(written).not.toContain(SIDECAR);
	});
});

describe("specification version alignment", () => {
	/* @covers project-map:DLT-009 */
	/* @covers project-map:DLT-010 */
	/* @covers project-map:DLT-011 */
	/* @covers project-map:DLT-013 */
	it("pins corrected versions without surface_member_drift", async () => {
		const surfaces = await readFile(
			new URL("../../spec/spec.md", import.meta.url),
			"utf8",
		);
		const deltas = await readFile(
			new URL("../../spec/detection.md", import.meta.url),
			"utf8",
		);

		const cliSurface = normativeRecord(surfaces, "project-map:SUR-001");
		const mapSurface = normativeRecord(surfaces, "project-map:SUR-002");
		const configurationDelta = normativeRecord(deltas, "project-map:DLT-004");
		const detectionDelta = normativeRecord(deltas, "project-map:DLT-005");
		const policyDelta = normativeRecord(deltas, "project-map:DLT-009");
		const configurationCorrection = normativeRecord(
			deltas,
			"project-map:DLT-010",
		);
		const detectionCorrection = normativeRecord(deltas, "project-map:DLT-011");
		const mapCorrection = normativeRecord(deltas, "project-map:DLT-013");

		expect(cliSurface).toContain('version: "1.2.0"');
		expect(mapSurface).toContain('version: "1.1.0"');
		expect(configurationDelta).toContain('intended_version: "1.2.0"');
		expect(detectionDelta).toContain('intended_version: "1.2.0"');
		expect(policyDelta).toMatch(
			/id: project-map:SUR-001\s+intended_version: "1\.2\.0"[\s\S]*id: project-map:SUR-002\s+intended_version: "1\.1\.0"/,
		);
		expect(configurationCorrection).toContain("target_id: project-map:DLT-004");
		expect(detectionCorrection).toContain("target_id: project-map:SUR-001");
		expect(mapCorrection).toContain("target_id: project-map:SUR-002");
		expect(mapCorrection).toContain('intended_version: "1.1.0"');
	});
});

describe("facts artifact content and stability", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("openapi-serves-minimal");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-005 */
	/* @covers project-map:BEH-007 */
	it("carries one fact per declared path and method", async () => {
		await runCli(workspace.dir, ["build"]);

		const artifact: unknown = JSON.parse(await artifactOf(workspace.dir));
		expect(artifact).toMatchObject({
			schema_version: "1",
			repository_identity: "sample/served",
		});
		expect(JSON.stringify(artifact)).toContain("/v2/orders/{}");
	});

	/* @covers project-map:INV-003 */
	/* @covers project-map:GA-002 */
	it("emits identical bytes on two consecutive builds", async () => {
		await runCli(workspace.dir, ["build"]);
		const first = await artifactOf(workspace.dir);

		await runCli(workspace.dir, ["build"]);
		const second = await artifactOf(workspace.dir);

		expect(second).toBe(first);
	});

	/* @covers project-map:INV-003 */
	it("emits identical bytes for a copy placed at another absolute path", async () => {
		await runCli(workspace.dir, ["build"]);
		const original = await artifactOf(workspace.dir);
		const elsewhere = await createWorkspace();
		await cp(workspace.dir, elsewhere.dir, { recursive: true });

		await runCli(elsewhere.dir, ["build"]);
		const copied = await artifactOf(elsewhere.dir);
		await elsewhere.dispose();

		expect(copied).toBe(original);
	});

	/* @covers project-map:INV-003 */
	it("keeps the timestamp out of the compared bytes and in the sidecar", async () => {
		await runCli(workspace.dir, ["build"]);

		const artifact = await artifactOf(workspace.dir);
		const sidecar = await readFile(path.join(workspace.dir, SIDECAR), "utf8");

		expect(artifact).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
		expect(sidecar).toMatch(/\d{4}-\d{2}-\d{2}T/);
	});

	/* @covers project-map:GA-002 */
	it("regenerates whole rather than patching a previous artifact", async () => {
		await mkdir(path.join(workspace.dir, ".project-map"), { recursive: true });
		await writeFile(
			path.join(workspace.dir, FACTS),
			'{"facts":[{"id":"sha256:stale"}]}\n',
			"utf8",
		);

		await runCli(workspace.dir, ["build"]);

		expect(await artifactOf(workspace.dir)).not.toContain("sha256:stale");
	});
});
