import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const FIXTURE = "python-aiohttp-minimal";
const MD = "PROJECT_MAP.md";
const JSON_DOC = "project-map.json";

async function disableJsonOutput(dir: string): Promise<void> {
	const configPath = path.join(dir, ".project-map.yaml");
	const original = await readFile(configPath, "utf8");
	await writeFile(
		configPath,
		original.replace(`json: ${JSON_DOC}`, "json: null"),
		"utf8",
	);
}

describe("build and check mode", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace(FIXTURE);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-001 */
	/* @covers project-map:POL-001 */
	it("writes exactly the two configured output documents", async () => {
		const before = await listFiles(workspace.dir);

		const code = await runCli(workspace.dir, ["build"]);

		expect(code).toBe(0);
		const added = (await listFiles(workspace.dir)).filter(
			(entry) => !before.includes(entry),
		);
		expect(added).toEqual([MD, JSON_DOC].sort());
	});

	/* @covers project-map:BEH-001 */
	/* @covers project-map:POL-001 */
	it("writes no JSON document when output.json is null", async () => {
		await disableJsonOutput(workspace.dir);
		const before = await listFiles(workspace.dir);

		const code = await runCli(workspace.dir, ["build"]);

		expect(code).toBe(0);
		const added = (await listFiles(workspace.dir)).filter(
			(entry) => !before.includes(entry),
		);
		expect(added).toEqual([MD]);
	});

	/* @covers project-map:BEH-002 */
	/* @covers project-map:POL-001 */
	it("check mode over an up-to-date document exits 0 and writes nothing", async () => {
		await runCli(workspace.dir, ["build"]);
		const filesBefore = await listFiles(workspace.dir);
		const bytesBefore = await readFile(path.join(workspace.dir, MD), "utf8");

		const code = await runCli(workspace.dir, ["build", "--check"]);

		expect(code).toBe(0);
		expect(await listFiles(workspace.dir)).toEqual(filesBefore);
		expect(await readFile(path.join(workspace.dir, MD), "utf8")).toBe(
			bytesBefore,
		);
	});

	/* @covers project-map:BEH-002 */
	/* @covers project-map:POL-001 */
	it("check mode with the document absent exits 1 and creates nothing", async () => {
		const filesBefore = await listFiles(workspace.dir);

		const code = await runCli(workspace.dir, ["build", "--check"]);

		expect(code).toBe(1);
		expect(await listFiles(workspace.dir)).toEqual(filesBefore);
	});
});

describe("check mode drift classes", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace(FIXTURE);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-002 */
	/* @covers project-map:INV-001 */
	/* @covers project-map:DLT-020 */
	it("check mode reports a document differing in whitespace alone", async () => {
		await runCli(workspace.dir, ["build"]);
		const mdPath = path.join(workspace.dir, MD);
		const drifted = `${await readFile(mdPath, "utf8")}\n`;
		await writeFile(mdPath, drifted, "utf8");

		const code = await runCli(workspace.dir, ["build", "--check"]);

		expect(code).toBe(1);
		expect(await readFile(mdPath, "utf8")).toBe(drifted);
	});

	/* @covers project-map:BEH-002 */
	it("check mode reports a document differing in a rendered fact", async () => {
		await runCli(workspace.dir, ["build"]);
		const mdPath = path.join(workspace.dir, MD);
		const drifted = (await readFile(mdPath, "utf8")).replace(
			"# Project Map: `aiohttp-minimal`",
			"# Project Map: `renamed`",
		);
		await writeFile(mdPath, drifted, "utf8");
		const filesBefore = await listFiles(workspace.dir);

		const code = await runCli(workspace.dir, ["build", "--check"]);

		expect(code).toBe(1);
		expect(await readFile(mdPath, "utf8")).toBe(drifted);
		expect(await listFiles(workspace.dir)).toEqual(filesBefore);
	});
});
