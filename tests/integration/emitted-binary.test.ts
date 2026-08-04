import { execFile } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

/**
 * Every obligation of project-map:CTR-001 is stated over an invocation of the
 * command, and the rest of the suite invokes the program in process. This one
 * spawns the emitted `bin` target the way a shell does, which is the only place
 * the file's mode is observable.
 */
describe.skipIf(process.platform === "win32")("the emitted binary", () => {
	beforeAll(async () => {
		await run("npm", ["run", "build"], { cwd: REPO_ROOT });
	});

	/* @covers project-map:CTR-001 */
	/* @covers project-map:CTR-009 */
	it("runs directly, without an interpreter in front of it", async () => {
		const binary = path.join(REPO_ROOT, "dist/cli/index.js");

		const { stdout } = await run(binary, ["version"]);

		expect(stdout).toContain("project-map v");
	});
});
