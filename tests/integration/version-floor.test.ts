import { chmod, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const CONFIG = ".project-map.yaml";
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/** The running release, which no test can vary: see the plan's note on TOOL_VERSION. */
async function runningVersion(): Promise<string> {
	const pkg: unknown = JSON.parse(
		await readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
	);
	const version: unknown = Object.getOwnPropertyDescriptor(
		pkg,
		"version",
	)?.value;
	if (typeof version !== "string") {
		throw new Error("package.json carries no version");
	}
	return version;
}

async function configOf(dir: string): Promise<string> {
	return readFile(path.join(dir, CONFIG), "utf8");
}

/** Prepends a floor whose surroundings the raise has to leave alone. */
async function withFloor(dir: string, floor: string): Promise<void> {
	const configPath = path.join(dir, CONFIG);
	const preamble = [
		"# The lowest project-map version allowed to rebuild this map.\r",
		`min_tool_version: "${floor}" # pinned by the platform team`,
		"",
		"",
	].join("\n");
	await writeFile(configPath, preamble + (await configOf(dir)), "utf8");
}

describe("a release below the declared floor", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
		await withFloor(workspace.dir, "99.0.0");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-017 */
	/* @covers project-map:DLT-029 */
	it("refuses to build and writes no path", async () => {
		const before = await listFiles(workspace.dir);

		expect(await runCli(workspace.dir, ["build"])).toBe(7);
		expect(await listFiles(workspace.dir)).toEqual(before);
	});

	/* @covers project-map:BEH-017 */
	it("refuses to check", async () => {
		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(7);
	});

	/* @covers project-map:BEH-017 */
	it("refuses to report the unit digest", async () => {
		expect(await runCli(workspace.dir, ["facts", "--unit-digest"])).toBe(7);
	});

	/* @covers project-map:DLT-031 */
	it("names the upgrade command, the floor and the file", async () => {
		const written: string[] = [];
		const realWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (chunk: string | Uint8Array): boolean => {
			written.push(String(chunk));
			return true;
		};

		try {
			await runCli(workspace.dir, ["build"]);
		} finally {
			process.stderr.write = realWrite;
		}

		const message = written.join("");
		expect(message).toContain("npm i -g project-map-cli@latest");
		expect(message).toContain("99.0.0");
		expect(message).toContain(CONFIG);
	});

	/* @covers project-map:POL-001 */
	/* @covers project-map:INV-006 */
	it("leaves the floor it refused untouched", async () => {
		const before = await configOf(workspace.dir);

		await runCli(workspace.dir, ["build"]);

		expect(await configOf(workspace.dir)).toBe(before);
	});
});

describe("a release above the declared floor", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
		await withFloor(workspace.dir, "1.0.0");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-017 */
	/* @covers project-map:DLT-028 */
	it("raises the floor to its own major and minor with patch zero", async () => {
		const before = await configOf(workspace.dir);
		const [major, minor] = (await runningVersion()).split(".");

		expect(await runCli(workspace.dir, ["build"])).toBe(0);

		expect(await configOf(workspace.dir)).toBe(
			before.replace('"1.0.0"', `"${major}.${minor}.0"`),
		);
	});

	/* @covers project-map:BEH-017 */
	it("writes nothing to the configuration under --check", async () => {
		const before = await configOf(workspace.dir);

		await runCli(workspace.dir, ["build", "--check"]);

		expect(await configOf(workspace.dir)).toBe(before);
	});

	/* @covers project-map:BEH-017 */
	it("keeps a build whose configuration is read-only at exit 0", async () => {
		const configPath = path.join(workspace.dir, CONFIG);
		const before = await configOf(workspace.dir);
		await chmod(configPath, 0o444);

		expect(await runCli(workspace.dir, ["build"])).toBe(0);

		expect(await configOf(workspace.dir)).toBe(before);
		expect(await listFiles(workspace.dir)).toContain("PROJECT_MAP.md");
	});
});

describe("a build that did not reach exit 0", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await withFloor(workspace.dir, "1.0.0");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-017 */
	/* @covers project-map:INV-006 */
	it("raises no floor under a strict verdict", async () => {
		const before = await configOf(workspace.dir);

		expect(await runCli(workspace.dir, ["build", "--strict"])).toBe(6);

		expect(await configOf(workspace.dir)).toBe(before);
	});
});

describe("a build that raised the floor", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await withFloor(workspace.dir, "1.0.0");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-030 */
	it("is a fixed point: the check that follows it agrees", async () => {
		expect(await runCli(workspace.dir, ["build"])).toBe(0);

		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(0);
	});

	/* @covers project-map:DLT-030 */
	it("leaves the facts artifact byte-identical", async () => {
		const factsPath = path.join(workspace.dir, ".project-map/facts.json");
		await runCli(workspace.dir, ["build"]);
		const before = await readFile(factsPath, "utf8");

		await runCli(workspace.dir, ["build"]);

		expect(await readFile(factsPath, "utf8")).toBe(before);
	});
});

describe("a configuration declaring no floor", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-017 */
	it("builds and leaves the configuration alone", async () => {
		const before = await configOf(workspace.dir);

		expect(await runCli(workspace.dir, ["build"])).toBe(0);

		expect(await configOf(workspace.dir)).toBe(before);
	});
});

describe("the floor grammar", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-027 */
	it.each(["2.0", "v2.0.0", "latest", "2.1.0-rc.1", "02.0.0"])(
		"rejects the floor %s at configuration time",
		async (floor) => {
			await withFloor(workspace.dir, floor);

			expect(await runCli(workspace.dir, ["build"])).toBe(5);
		},
	);

	/* @covers project-map:DLT-027 */
	it("rejects a floor written unquoted as a number", async () => {
		const configPath = path.join(workspace.dir, CONFIG);
		await writeFile(
			configPath,
			`min_tool_version: 2.0\n\n${await configOf(workspace.dir)}`,
			"utf8",
		);

		expect(await runCli(workspace.dir, ["build"])).toBe(5);
	});
});
