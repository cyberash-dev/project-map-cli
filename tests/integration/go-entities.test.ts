import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

async function documentOf(dir: string): Promise<string> {
	return readFile(path.join(dir, "PROJECT_MAP.md"), "utf8");
}

describe("two declarations claiming one name", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("go-entities-minimal");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-016 */
	it("tells two same-named types apart by their package", async () => {
		const document = await documentOf(workspace.dir);

		expect(document).toContain("### `config.Config`");
		expect(document).toContain("### `bunker.Config`");
		expect(document).not.toContain("### `Config`");
	});

	/* @covers project-map:DLT-016 */
	it("keeps a method with the package that declares its receiver", async () => {
		const document = await documentOf(workspace.dir);
		const claimed = document
			.split("\n")
			.filter((line) => line.includes("SnapshotRoots"));

		expect(claimed).toEqual(["- Methods: `SnapshotRoots, GetServiceToken`"]);
	});

	/* @covers project-map:DLT-016 */
	it("tells two same-named enums apart by their package", async () => {
		const document = await documentOf(workspace.dir);

		expect(document).toContain("### `config.Kind`");
		expect(document).toContain("### `bunker.Kind`");
	});
});

describe("a field whose type is not a plain name", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("go-entities-minimal");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-016 */
	it("renders a pointer type without escaping it as emphasis", async () => {
		const document = await documentOf(workspace.dir);

		expect(document).toContain("`Loader: *confetti.Loader`");
		expect(document).not.toContain("\\*confetti");
	});

	/* @covers project-map:DLT-016 */
	it("folds a multi-line type onto one line", async () => {
		const document = await documentOf(workspace.dir);

		expect(document).not.toContain("&#x9;");
		expect(document).toContain('TVM: struct { SRC string `yaml:"src"` }');
	});
});
