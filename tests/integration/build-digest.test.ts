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
import {
	ADAPTER_REGISTRY_DIGEST,
	ANALYZER_BUILD_DIGEST,
} from "../../src/features/detect/registry/build-digest.generated.js";

const run = promisify(execFile);
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const GENERATED = "src/features/detect/registry/build-digest.generated.ts";

/* One file per covered tree, so a test can name the tree it edits. */
const SOURCES: Readonly<Record<string, string>> = {
	"src/core/domain/facts/fact.ts": "export const fact = true;\n",
	"src/features/detect/canonical/jcs.ts": "export const jcs = true;\n",
	"src/features/detect/index/imports.ts": "export const imports = true;\n",
	"src/features/detect/inbound/router.ts": "export const router = true;\n",
	"src/features/detect/outbound/sink.ts": "export const sink = true;\n",
	"src/features/detect/outbound/ladder.ts": "export const ladder = true;\n",
	"src/features/detect/outbound/target-binding.ts":
		"export const binding = true;\n",
	"src/features/detect/value/fold.ts": "export const fold = true;\n",
	"src/infrastructure/parser/ts-utils.ts": "export const parser = true;\n",
	"src/infrastructure/openapi/yaml-openapi-reader.ts":
		"export const reader = true;\n",
};

type Checkout = { readonly dir: string; readonly script: string };

async function checkout(): Promise<Checkout> {
	const dir = await mkdtemp(path.join(tmpdir(), "project-map-build-digest-"));
	onTestFinished(() => rm(dir, { force: true, recursive: true }));
	await mkdir(path.join(dir, "scripts"), { recursive: true });
	await mkdir(path.join(dir, path.dirname(GENERATED)), { recursive: true });
	const script = path.join(dir, "scripts/emit-build-digest.mjs");
	await copyFile(path.join(REPO_ROOT, "scripts/emit-build-digest.mjs"), script);
	await copyFile(
		path.join(REPO_ROOT, "package-lock.json"),
		path.join(dir, "package-lock.json"),
	);
	for (const [relPath, text] of Object.entries(SOURCES)) {
		await mkdir(path.join(dir, path.dirname(relPath)), { recursive: true });
		await writeFile(path.join(dir, relPath), text, "utf8");
	}
	return { dir, script };
}

type Digests = { readonly analyzer: string; readonly registry: string };

function constantOf(generated: string, name: string): string {
	const found = new RegExp(`${name} = "(sha256:[0-9a-f]{64})"`).exec(generated);
	if (found === null) {
		throw new Error(`the generated file declares no ${name}`);
	}
	return found[1] ?? "";
}

async function emit(target: Checkout): Promise<Digests> {
	await run("node", [target.script], { cwd: target.dir });
	const generated = await readFile(path.join(target.dir, GENERATED), "utf8");
	return {
		analyzer: constantOf(generated, "ANALYZER_BUILD_DIGEST"),
		registry: constantOf(generated, "ADAPTER_REGISTRY_DIGEST"),
	};
}

async function edit(target: Checkout, relPath: string): Promise<void> {
	await writeFile(
		path.join(target.dir, relPath),
		`${SOURCES[relPath] ?? ""}export const edited = true;\n`,
		"utf8",
	);
}

async function packagesOf(lockPath: string): Promise<Record<string, unknown>> {
	const lock: unknown = JSON.parse(await readFile(lockPath, "utf8"));
	const packages: unknown = Reflect.get(Object(lock), "packages");
	if (typeof packages !== "object" || packages === null) {
		throw new Error("the lockfile carries no packages map");
	}
	return { ...packages };
}

async function rewriteLock(
	target: Checkout,
	edit: (packages: Record<string, unknown>) => void,
): Promise<void> {
	const lockPath = path.join(target.dir, "package-lock.json");
	const packages = await packagesOf(lockPath);
	edit(packages);
	await writeFile(lockPath, JSON.stringify({ packages }), "utf8");
}

describe("the analyzer build digest and the adapter registry digest", () => {
	/* @covers project-map:CTR-008 */
	/* @covers project-map:INV-003 */
	it("covers the detector tree as it stands", async () => {
		const { stdout } = await run(
			"node",
			["scripts/emit-build-digest.mjs", "--check"],
			{ cwd: REPO_ROOT },
		);

		expect(stdout).toContain(ANALYZER_BUILD_DIGEST);
		expect(stdout).toContain(ADAPTER_REGISTRY_DIGEST);
	});

	/* @covers project-map:CTR-008 */
	/* @covers project-map:DLT-033 */
	it("emits two values that differ", () => {
		expect(ANALYZER_BUILD_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(ADAPTER_REGISTRY_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(ANALYZER_BUILD_DIGEST).not.toBe(ADAPTER_REGISTRY_DIGEST);
	});

	/* @covers project-map:CTR-008 */
	/* @covers project-map:DLT-033 */
	it("refuses a lockfile naming no entry for a pinned parser", async () => {
		const target = await checkout();
		await rewriteLock(target, (packages) => {
			Reflect.deleteProperty(packages, "node_modules/tree-sitter-python");
		});

		await expect(
			run("node", [target.script], { cwd: target.dir }),
		).rejects.toThrow(/tree-sitter-python/);
	});

	/* @covers project-map:INV-003 */
	it("accepts an up-to-date digest on a CRLF checkout", async () => {
		const target = await checkout();
		await run("node", [target.script], { cwd: target.dir });
		const generatedPath = path.join(target.dir, GENERATED);
		const generated = await readFile(generatedPath, "utf8");
		for (const [relPath, text] of Object.entries(SOURCES)) {
			await writeFile(
				path.join(target.dir, relPath),
				text.replaceAll("\n", "\r\n"),
				"utf8",
			);
		}
		await writeFile(generatedPath, generated.replaceAll("\n", "\r\n"), "utf8");

		await expect(
			run("node", [target.script, "--check"], { cwd: target.dir }),
		).resolves.toBeDefined();
	});
});

describe("what moves each digest", () => {
	/* @covers project-map:CTR-008 */
	/* @covers project-map:DLT-033 */
	it("moves both values for an adapter and the analyzer value alone for the canonicalizer", async () => {
		const target = await checkout();
		const before = await emit(target);

		await edit(target, "src/features/detect/inbound/router.ts");
		const afterAdapter = await emit(target);

		expect(afterAdapter.registry).not.toBe(before.registry);
		expect(afterAdapter.analyzer).not.toBe(before.analyzer);

		await edit(target, "src/features/detect/canonical/jcs.ts");
		const afterCanonical = await emit(target);

		expect(afterCanonical.registry).toBe(afterAdapter.registry);
		expect(afterCanonical.analyzer).not.toBe(afterAdapter.analyzer);
	});

	/* @covers project-map:CTR-008 */
	/* @covers project-map:DLT-033 */
	it("moves the analyzer value alone for a pinned parser version", async () => {
		const target = await checkout();
		const before = await emit(target);

		await rewriteLock(target, (packages) => {
			const key = "node_modules/tree-sitter-python";
			const entry: unknown = packages[key];
			if (typeof entry !== "object" || entry === null) {
				throw new Error(`the lockfile names no ${key}`);
			}
			packages[key] = { ...entry, version: "0.0.1" };
		});
		const after = await emit(target);

		expect(after.analyzer).not.toBe(before.analyzer);
		expect(after.registry).toBe(before.registry);
	});

	/* The shared tree-sitter and YAML bindings reach every fact without
	 * naming a language, so they are analyzer coverage and not registry. */
	/* @covers project-map:CTR-008 */
	/* @covers project-map:DLT-033 */
	it.each([
		"src/infrastructure/parser/ts-utils.ts",
		"src/infrastructure/openapi/yaml-openapi-reader.ts",
	])("moves the analyzer value for %s", async (relPath) => {
		const target = await checkout();
		const before = await emit(target);

		await edit(target, relPath);
		const after = await emit(target);

		expect(after.analyzer).not.toBe(before.analyzer);
		expect(after.registry).toBe(before.registry);
	});
});
