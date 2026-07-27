import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CommanderError } from "commander";
import { createProgram } from "../../src/cli/commands.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.resolve(HERE, "../fixtures");

export type Workspace = {
	readonly dir: string;
	dispose(): Promise<void>;
};

export async function createWorkspace(fixture?: string): Promise<Workspace> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "project-map-cli-"));
	if (fixture) {
		await cp(path.join(FIXTURES_DIR, fixture), dir, { recursive: true });
	}
	return {
		dir,
		dispose: async () => {
			await rm(dir, { recursive: true, force: true });
		},
	};
}

/**
 * Runs the real CLI in-process against `cwd` and returns the process exit code
 * the command set, normalizing "left untouched" to 0 the way node does.
 */
export async function runCli(
	cwd: string,
	argv: readonly string[],
): Promise<number> {
	const previousCwd = process.cwd();
	const previousCode = process.exitCode;
	process.chdir(cwd);
	process.exitCode = undefined;
	try {
		const program = createProgram();
		program.exitOverride();
		await program.parseAsync(["node", "project-map", ...argv]);
		return typeof process.exitCode === "number" ? process.exitCode : 0;
	} catch (err: unknown) {
		if (err instanceof CommanderError) {
			return err.exitCode;
		}
		throw err;
	} finally {
		process.exitCode = previousCode;
		process.chdir(previousCwd);
	}
}

/** Sorted repo-relative paths of every file under `dir`, for write-set assertions. */
export async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, {
		recursive: true,
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => {
			const abs = path.join(entry.parentPath, entry.name);
			return path.relative(dir, abs).split(path.sep).join("/");
		})
		.sort();
}
