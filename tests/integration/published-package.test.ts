import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

const ALLOW_LIST = ["dist", "README.md", "CHANGELOG.md", "LICENSE"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function manifest(): Promise<Record<string, unknown>> {
	const raw: unknown = JSON.parse(
		await readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
	);
	if (!isRecord(raw)) {
		throw new Error("package.json is not an object");
	}
	return raw;
}

/** The paths `npm pack` reports, which is what a consumer receives. */
async function packedPaths(): Promise<readonly string[]> {
	const { stdout } = await run("npm", ["pack", "--dry-run", "--json"], {
		cwd: REPO_ROOT,
		maxBuffer: 8 * 1024 * 1024,
	});
	const parsed: unknown = JSON.parse(stdout);
	const first: unknown = Array.isArray(parsed) ? parsed[0] : null;
	const files = isRecord(first) ? first["files"] : null;
	if (!Array.isArray(files)) {
		throw new Error("npm pack reported no file list");
	}
	return files.map((entry) =>
		isRecord(entry) && typeof entry["path"] === "string" ? entry["path"] : "",
	);
}

describe("the published package", () => {
	/* @covers project-map:CTR-009 */
	it("maps the command name onto the emitted entry point", async () => {
		const declared = await manifest();

		expect(declared["bin"]).toEqual({ "project-map": "dist/cli/index.js" });
	});

	/* @covers project-map:CTR-009 */
	it("declares the allow-list and the runtime range", async () => {
		const declared = await manifest();

		expect(declared["files"]).toEqual(ALLOW_LIST);
		expect(declared["engines"]).toEqual({ node: ">=22" });
	});

	/* @covers project-map:CTR-009 */
	it("carries every allow-listed path and nothing from the sources", async () => {
		const packed = await packedPaths();

		expect(packed).toContain("package.json");
		for (const allowed of ALLOW_LIST.filter((entry) => entry !== "dist")) {
			expect(packed).toContain(allowed);
		}
		expect(packed.filter((entry) => entry.startsWith("src/"))).toEqual([]);
		expect(packed.filter((entry) => entry.startsWith("tests/"))).toEqual([]);
	});
});
