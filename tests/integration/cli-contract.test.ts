import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("CLI exit-code contract", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-003 */
	/* @covers project-map:CTR-001 */
	it("build without a discoverable config exits 2 and writes nothing", async () => {
		const code = await runCli(workspace.dir, ["build"]);

		expect(code).toBe(2);
		expect(await listFiles(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:BEH-003 */
	it("build --check without a discoverable config also exits 2", async () => {
		const code = await runCli(workspace.dir, ["build", "--check"]);

		expect(code).toBe(2);
		expect(await listFiles(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:CTR-001 */
	it("watch reports unimplemented with exit 1", async () => {
		const code = await runCli(workspace.dir, ["watch"]);

		expect(code).toBe(1);
		expect(await listFiles(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:CTR-001 */
	it("install-git-hook rejects a --type outside its enumeration", async () => {
		const code = await runCli(workspace.dir, [
			"install-git-hook",
			"--type",
			"pre-merge",
		]);

		expect(code).toBe(1);
		expect(await listFiles(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:CTR-001 */
	/* @covers project-map:DLT-002 */
	it("claude install rejects a --scope outside its enumeration", async () => {
		const code = await runCli(workspace.dir, [
			"claude",
			"install",
			"--scope",
			"porject",
		]);

		expect(code).toBe(1);
		expect(await listFiles(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:CTR-001 */
	it("claude install with both --no-hook and --no-skill exits 1", async () => {
		const code = await runCli(workspace.dir, [
			"claude",
			"install",
			"--no-hook",
			"--no-skill",
		]);

		expect(code).toBe(1);
		expect(await listFiles(workspace.dir)).toEqual([]);
	});

	/* @covers project-map:CTR-001 */
	it("init writes a config, then refuses to overwrite it without --force", async () => {
		const first = await runCli(workspace.dir, ["init", "--lang", "python"]);
		expect(first).toBe(0);

		const configPath = path.join(workspace.dir, ".project-map.yaml");
		const original = await readFile(configPath, "utf8");

		const second = await runCli(workspace.dir, ["init", "--lang", "python"]);

		expect(second).toBe(1);
		expect(await readFile(configPath, "utf8")).toBe(original);
	});

	/* @covers project-map:DLT-006 */
	it("build exits 5 on a config carrying an unknown top-level key", async () => {
		await writeFile(
			path.join(workspace.dir, ".project-map.yaml"),
			"project:\n  name: probe\n  language: python\nnot_a_real_key: 1\n",
			"utf8",
		);

		expect(await runCli(workspace.dir, ["build"])).toBe(5);
	});
});
