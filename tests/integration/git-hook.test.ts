import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const run = promisify(execFile);
const CONFIG = ".project-map.yaml";

type HookRun = { readonly code: number; readonly output: string };

/** Runs the emitted hook the way git does, capturing both streams and the code. */
async function runHook(dir: string): Promise<HookRun> {
	try {
		const { stdout, stderr } = await run(
			"bash",
			[path.join(dir, ".git/hooks/pre-commit")],
			{ cwd: dir },
		);
		return { code: 0, output: stdout + stderr };
	} catch (error: unknown) {
		return {
			code: numberAt(error, "code") ?? -1,
			output: `${stringAt(error, "stdout")}${stringAt(error, "stderr")}`,
		};
	}
}

function memberAt(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null
		? Object.getOwnPropertyDescriptor(value, key)?.value
		: undefined;
}

function numberAt(value: unknown, key: string): number | null {
	const found: unknown = memberAt(value, key);
	return typeof found === "number" ? found : null;
}

function stringAt(value: unknown, key: string): string {
	const found: unknown = memberAt(value, key);
	return typeof found === "string" ? found : "";
}

async function withFloor(dir: string, floor: string): Promise<void> {
	const configPath = path.join(dir, CONFIG);
	const config = await readFile(configPath, "utf8");
	await writeFile(
		configPath,
		`min_tool_version: "${floor}"\n\n${config}`,
		"utf8",
	);
}

describe("the emitted git hook", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
		await mkdir(path.join(workspace.dir, ".git"), { recursive: true });
		await runCli(workspace.dir, ["install-git-hook", "--type", "pre-commit"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-018 */
	it("does not report a version refusal as a stale document", async () => {
		await withFloor(workspace.dir, "99.0.0");

		const { code, output } = await runHook(workspace.dir);

		expect(code).not.toBe(0);
		expect(output).toContain("npm i -g project-map-cli@latest");
		expect(output).not.toContain("out of date");
	});

	/* @covers project-map:BEH-018 */
	it("tells a drifted document to be regenerated", async () => {
		await runCli(workspace.dir, ["build"]);
		await writeFile(
			path.join(workspace.dir, "PROJECT_MAP.md"),
			"stale\n",
			"utf8",
		);

		const { code, output } = await runHook(workspace.dir);

		expect(code).not.toBe(0);
		expect(output).toContain("out of date");
	});

	/* @covers project-map:BEH-018 */
	it("lets a document in sync through", async () => {
		await runCli(workspace.dir, ["build"]);

		expect((await runHook(workspace.dir)).code).toBe(0);
	});
});
