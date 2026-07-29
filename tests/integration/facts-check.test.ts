import { readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	listFiles,
	runCli,
	type Workspace,
} from "../support/workspace.js";

const ARTIFACT = ".project-map/facts.json";

function codesOf(artifact: unknown): string[] {
	if (typeof artifact !== "object" || artifact === null) {
		throw new Error("the artifact is not an object");
	}
	const diagnostics: unknown = Reflect.get(artifact, "diagnostics");
	if (!Array.isArray(diagnostics)) {
		throw new Error("the artifact carries no diagnostics array");
	}
	return diagnostics.map((entry: unknown) =>
		String(Reflect.get(Object(entry), "code")),
	);
}

async function tamper(
	dir: string,
	edit: (document: Record<string, unknown>) => void,
): Promise<void> {
	const artifactPath = path.join(dir, ARTIFACT);
	const parsed: unknown = JSON.parse(await readFile(artifactPath, "utf8"));
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("the artifact is not an object");
	}
	const document: Record<string, unknown> = { ...parsed };
	edit(document);
	await writeFile(artifactPath, JSON.stringify(document), "utf8");
}

describe("build --check over the facts artifact", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-006 */
	it("exits 0 when the committed bytes equal the built bytes", async () => {
		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(0);
	});

	/* @covers project-map:BEH-006 */
	it("writes no path while checking", async () => {
		const before = await listFiles(workspace.dir);

		await runCli(workspace.dir, ["build", "--check"]);

		expect(await listFiles(workspace.dir)).toEqual(before);
	});

	/* @covers project-map:BEH-006 */
	it("exits 1 when the artifact drifted", async () => {
		await tamper(workspace.dir, (document) => {
			document["coverage"] = { inbound: "drifted" };
		});

		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(1);
	});

	/* @covers project-map:BEH-006 */
	it("exits 1 when the artifact is absent", async () => {
		await rm(path.join(workspace.dir, ARTIFACT));

		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(1);
	});

	/* @covers project-map:DLT-006 */
	it("exits 3 when the committed artifact names another analyzer build", async () => {
		await tamper(workspace.dir, (document) => {
			document["analyzer_build_digest"] = `sha256:${"0".repeat(64)}`;
			document["coverage"] = { inbound: "drifted too" };
		});

		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(3);
	});

	/* @covers project-map:BEH-006 */
	it("exits 0 when only the sidecar differs", async () => {
		await writeFile(
			path.join(workspace.dir, ".project-map/facts.meta.json"),
			'{"generated_at":"1999-01-01T00:00:00.000Z"}\n',
			"utf8",
		);

		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(0);
	});
});

describe("build --check without a facts artifact", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-dsl-routes");
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-006 */
	it("compares the map document alone", async () => {
		await runCli(workspace.dir, ["build", "--out", "MAP.md"]);

		expect(
			await runCli(workspace.dir, ["build", "--check", "--out", "MAP.md"]),
		).toBe(0);
	});
});

describe("a mandatory check diagnostic", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound-unresolved");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-006 */
	it("exits 4 over an otherwise equal artifact", async () => {
		expect(await runCli(workspace.dir, ["build", "--check"])).toBe(4);
	});

	/* @covers project-map:CTR-005 */
	it("still emits the claimed site with its path typed", async () => {
		const artifact: unknown = JSON.parse(
			await readFile(path.join(workspace.dir, ARTIFACT), "utf8"),
		);

		expect(codesOf(artifact)).toContain("selector_unresolved");
	});
});
