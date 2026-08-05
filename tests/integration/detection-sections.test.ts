import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

/** The sections that render without any detection configured. */
const UNCONDITIONAL_HEADINGS = [
	"## Bounded contexts",
	"## Domain entities",
	"## Enums",
];

const DETECTION_HEADINGS = ["## HTTP endpoints", "## External dependencies"];

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
		config.replace(
			/sections:(?: \[\]\n|\n(?: {2}- \w+\n)+)/,
			`sections:\n${listed}\n`,
		),
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

	/* @covers project-map:DLT-019 */
	it("renders no detection section for a configuration that names none", async () => {
		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		for (const heading of DETECTION_HEADINGS) {
			expect(document).not.toContain(heading);
		}
	});

	/* @covers project-map:DLT-007 */
	it("renders a detection section a configuration opts into", async () => {
		await withSections(workspace.dir, ["interactions"]);

		await runCli(workspace.dir, ["build"]);

		expect(await documentOf(workspace.dir)).toContain(
			"## External dependencies",
		);
	});

	/* @covers project-map:DLT-015 */
	it("renders an identifier as code rather than escaping it as prose", async () => {
		await withSections(workspace.dir, ["interactions"]);

		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		expect(document).toContain("`OrdersClient.create_order`");
		expect(document).not.toContain("create\\_order");
	});

	/* @covers project-map:DLT-015 */
	it("keeps the underscores of a dunder member out of emphasis", async () => {
		await withSections(workspace.dir, ["interactions"]);

		await runCli(workspace.dir, ["build"]);

		expect(await documentOf(workspace.dir)).toContain(
			"`OrdersClient.__call__`",
		);
	});

	/* @covers project-map:CTR-003 */
	it("renders an absent outbound value as an empty cell", async () => {
		const configPath = path.join(workspace.dir, ".project-map.yaml");
		const config = await readFile(configPath, "utf8");
		await writeFile(
			configPath,
			config.replace(
				'        target: { kind: class_const, selector: "BASE_URL" }\n',
				"",
			),
			"utf8",
		);
		await withSections(workspace.dir, ["interactions"]);

		await runCli(workspace.dir, ["build"]);

		expect(await documentOf(workspace.dir)).not.toContain("| ``");
	});

	/* @covers project-map:DLT-019 */
	it("renders the reworked outbound under the legacy id", async () => {
		await withSections(workspace.dir, ["interactions"]);

		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		expect(document).toContain("## External dependencies");
		expect(document).toContain("`OrdersClient.create_order`");
	});

	/* @covers project-map:DLT-007 */
	it("exits 5 on a section id outside the accepted set", async () => {
		await withSections(workspace.dir, ["inbound_endpoints"]);

		expect(await runCli(workspace.dir, ["build"])).toBe(5);
	});
});

describe("the coverage measures leave the document", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-023 */
	it("rejects the removed coverage section", async () => {
		await withSections(workspace.dir, ["detection_coverage"]);

		expect(await runCli(workspace.dir, ["build"])).toBe(5);
	});

	/* @covers project-map:DLT-023 */
	it("keeps the measures in the artifact it renders no section for", async () => {
		await withSections(workspace.dir, ["interactions"]);

		await runCli(workspace.dir, ["build"]);

		expect(await documentOf(workspace.dir)).not.toContain(
			"## Detection coverage",
		);
		const artifact: unknown = JSON.parse(
			await readFile(
				path.join(workspace.dir, ".project-map/facts.json"),
				"utf8",
			),
		);
		expect(artifact).toHaveProperty("coverage");
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

	/* @covers project-map:DLT-019 */
	it("renders what needs no detection and none of what does", async () => {
		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		for (const heading of UNCONDITIONAL_HEADINGS) {
			expect(document).toContain(heading);
		}
		for (const heading of DETECTION_HEADINGS) {
			expect(document).not.toContain(heading);
		}
	});

	/* @covers project-map:ASM-002 */
	it("validates a detection section without an identity to emit under", async () => {
		await withSections(workspace.dir, ["contexts", "endpoints"]);

		expect(await runCli(workspace.dir, ["build"])).toBe(0);
		expect(await documentOf(workspace.dir)).not.toContain("## HTTP endpoints");
	});

	/* @covers project-map:DLT-019 */
	it("renders no legacy section where nothing configures detection", async () => {
		await withIdentity(workspace.dir);
		await withSections(workspace.dir, [
			"contexts",
			"endpoints",
			"interactions",
		]);

		await runCli(workspace.dir, ["build"]);

		const document = await documentOf(workspace.dir);
		expect(document).not.toContain("## HTTP endpoints");
		expect(document).not.toContain("## External dependencies");
		expect(document).toContain("## Bounded contexts");
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
