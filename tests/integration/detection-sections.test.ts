import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const LEGACY_HEADINGS = [
	"## Bounded contexts",
	"## Domain entities",
	"## Enums",
	"## HTTP endpoints",
	"## Generation metadata",
];

const DETECTION_HEADINGS = [
	"## Inbound endpoints",
	"## Outbound operations",
	"## Detection coverage",
];

async function documentOf(dir: string): Promise<string> {
	return readFile(path.join(dir, "PROJECT_MAP.md"), "utf8");
}

async function withSections(
	dir: string,
	ids: readonly string[],
): Promise<void> {
	const configPath = path.join(dir, ".project-map.yaml");
	const config = await readFile(configPath, "utf8");
	const listed = ids.map((id) => `  - ${id}`).join("\n");
	await writeFile(
		configPath,
		config.replace(/sections:\n(?: {2}- \w+\n)+/, `sections:\n${listed}\n`),
		"utf8",
	);
}

async function withIdentity(dir: string): Promise<void> {
	const configPath = path.join(dir, ".project-map.yaml");
	const config = await readFile(configPath, "utf8");
	await writeFile(
		configPath,
		`${config}\nrepository_identity: sample/legacy-beside\n`,
		"utf8",
	);
}

describe("the reworked detection renders under its own section ids", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CON-001 */
	it("renders no detection section for a configuration that names none", async () => {
		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		for (const heading of DETECTION_HEADINGS) {
			expect(document).not.toContain(heading);
		}
	});

	/* @covers project-map:DLT-007 */
	it("renders a detection section a configuration opts into", async () => {
		await withSections(workspace.dir, ["metadata", "outbound_operations"]);

		await runCli(workspace.dir, ["build"]);

		expect(await documentOf(workspace.dir)).toContain("## Outbound operations");
	});

	/* @covers project-map:DLT-007 */
	it("exits 5 on a section id outside the accepted set", async () => {
		await withSections(workspace.dir, ["metadata", "inbound_routes"]);

		expect(await runCli(workspace.dir, ["build"])).toBe(5);
	});
});

describe("the default section list", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-007 */
	it("renders the legacy sections and none of the new ones", async () => {
		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		for (const heading of LEGACY_HEADINGS) {
			expect(document).toContain(heading);
		}
		for (const heading of DETECTION_HEADINGS) {
			expect(document).not.toContain(heading);
		}
	});

	/* @covers project-map:CON-001 */
	it("keeps the legacy section beside its reworked counterpart", async () => {
		await withIdentity(workspace.dir);
		await withSections(workspace.dir, [
			"metadata",
			"interactions",
			"outbound_operations",
		]);

		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		expect(document).toContain("## External dependencies");
		expect(document).toContain("## Generation metadata");
	});
});

describe("the facts command", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-006 */
	it("prints the analysis-unit digest and writes no path", async () => {
		const before = await listFiles(workspace.dir);

		expect(await runCli(workspace.dir, ["facts", "--unit-digest"])).toBe(0);
		expect(await listFiles(workspace.dir)).toEqual(before);
	});
});
