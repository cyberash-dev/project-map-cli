import { execFile } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished } from "vitest";
import { DETECTOR_SOURCE_DIGEST } from "../../src/features/detect/registry/build-digest.generated.js";

const run = promisify(execFile);
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

describe("analyzer build digest", () => {
	/* @covers project-map:CTR-008 */
	/* @covers project-map:INV-003 */
	it("covers the detector tree as it stands", async () => {
		const { stdout } = await run(
			"node",
			["scripts/emit-build-digest.mjs", "--check"],
			{ cwd: REPO_ROOT },
		);

		expect(stdout).toContain(DETECTOR_SOURCE_DIGEST);
	});

	/* @covers project-map:INV-003 */
	it("accepts an up-to-date digest on a CRLF checkout", async () => {
		const checkoutRoot = await mkdtemp(
			path.join(tmpdir(), "project-map-build-digest-"),
		);
		onTestFinished(() => rm(checkoutRoot, { force: true, recursive: true }));
		const scriptDirectory = path.join(checkoutRoot, "scripts");
		const detectorDirectory = path.join(
			checkoutRoot,
			"src/features/detect/registry",
		);
		const factsDirectory = path.join(checkoutRoot, "src/core/domain/facts");
		await Promise.all([
			mkdir(scriptDirectory, { recursive: true }),
			mkdir(detectorDirectory, { recursive: true }),
			mkdir(factsDirectory, { recursive: true }),
		]);
		const scriptPath = path.join(scriptDirectory, "emit-build-digest.mjs");
		const detectorPath = path.join(
			checkoutRoot,
			"src/features/detect/detector.ts",
		);
		const factPath = path.join(factsDirectory, "fact.ts");
		const generatedPath = path.join(
			detectorDirectory,
			"build-digest.generated.ts",
		);
		await copyFile(
			path.join(REPO_ROOT, "scripts/emit-build-digest.mjs"),
			scriptPath,
		);
		await Promise.all([
			writeFile(detectorPath, "export const detector = true;\n", "utf8"),
			writeFile(factPath, "export const fact = true;\n", "utf8"),
		]);
		await run("node", [scriptPath], { cwd: checkoutRoot });
		const generated = await readFile(generatedPath, "utf8");
		await Promise.all([
			writeFile(detectorPath, "export const detector = true;\r\n", "utf8"),
			writeFile(factPath, "export const fact = true;\r\n", "utf8"),
			writeFile(generatedPath, generated.replaceAll("\n", "\r\n"), "utf8"),
		]);

		const { stdout } = await run("node", [scriptPath, "--check"], {
			cwd: checkoutRoot,
		});

		expect(stdout).toContain("over 2 file(s)");
	});

	/* @covers project-map:CTR-008 */
	it("is a sha256 prefix followed by lowercase hex", () => {
		expect(DETECTOR_SOURCE_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
	});
});
