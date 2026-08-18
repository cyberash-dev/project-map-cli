import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigTimeError } from "../../src/core/domain/config-time-error.js";
import type { AnalysisUnit } from "../../src/core/ports/analysis-unit.port.js";
import { FilesystemAnalysisUnitMaterializer } from "../../src/infrastructure/analysis-unit/materializer.js";
import { CosmiconfigLoader } from "../../src/infrastructure/config/loader.js";
import { GlobbyWalker } from "../../src/infrastructure/filesystem/globby-walker.js";
import { NodeFileReader } from "../../src/infrastructure/filesystem/node-fs.js";
import { createWorkspace, type Workspace } from "../support/workspace.js";

const CONFIG = [
	"project:",
	"  name: sample",
	"  language: python",
	"repository_identity: sample-service",
	"analysis_unit:",
	"  sources:",
	'    include: ["**/*.py"]',
	"  config_declarations:",
	'    - "settings/**"',
	"output:",
	"  facts: .project-map/facts.json",
	"",
].join("\n");

async function seed(dir: string): Promise<void> {
	await mkdir(path.join(dir, "app"), { recursive: true });
	await mkdir(path.join(dir, "settings"), { recursive: true });
	await writeFile(path.join(dir, ".project-map.yaml"), CONFIG, "utf8");
	await writeFile(path.join(dir, "app", "client.py"), "URL = 'x'\n", "utf8");
	await writeFile(path.join(dir, "app", "notes.md"), "not a source\n", "utf8");
	await writeFile(
		path.join(dir, "settings", "010-common.conf"),
		"SATURN_API_URL = 'https://saturn'\n",
		"utf8",
	);
}

async function materializeAt(
	dir: string,
	specLocators: readonly string[] = [],
	registryVersion = "test-registry-1",
): Promise<AnalysisUnit> {
	const config = await new CosmiconfigLoader().load(dir, null);
	if (!config) {
		throw new Error("config did not load");
	}
	const materializer = new FilesystemAnalysisUnitMaterializer({
		walker: new GlobbyWalker(),
		reader: new NodeFileReader(),
		monorepoRoot: null,
	});
	return materializer.materialize({
		cwd: dir,
		config,
		specLocators,
		registryVersion,
	});
}

describe("analysis unit materialization", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
		await seed(workspace.dir);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-004 */
	it("carries the declared sources and no absolute path", async () => {
		const unit = await materializeAt(workspace.dir);

		expect(unit.sources.map((s) => s.path)).toEqual(["app/client.py"]);
		expect(JSON.stringify(unit)).not.toContain(workspace.dir);
	});

	/* @covers project-map:CTR-004 */
	it("carries a config declaration that the source selection excludes", async () => {
		const unit = await materializeAt(workspace.dir);

		expect(unit.configDocuments.map((d) => d.locator)).toEqual([
			"settings/010-common.conf",
		]);
		expect(unit.sources.map((s) => s.path)).not.toContain(
			"settings/010-common.conf",
		);
	});

	/* @covers project-map:CTR-004 */
	/* @covers project-map:INV-003 */
	it("digests one tree identically across runs", async () => {
		const first = await materializeAt(workspace.dir);
		const second = await materializeAt(workspace.dir);

		expect(second.digest).toBe(first.digest);
	});

	/* @covers project-map:CTR-004 */
	/* @covers project-map:DLT-033 */
	it("digests one tree differently under another registry version", async () => {
		const first = await materializeAt(workspace.dir, [], "test-registry-1");
		const second = await materializeAt(workspace.dir, [], "test-registry-2");

		expect(second.digest).not.toBe(first.digest);
	});

	/* @covers project-map:CTR-004 */
	/* @covers project-map:INV-003 */
	it("digests a copy at another absolute path identically", async () => {
		const original = await materializeAt(workspace.dir);
		const elsewhere = await createWorkspace();
		await cp(workspace.dir, elsewhere.dir, { recursive: true });

		const copied = await materializeAt(elsewhere.dir);
		await elsewhere.dispose();

		expect(copied.digest).toBe(original.digest);
	});
});

describe("what moves the analysis unit digest", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
		await seed(workspace.dir);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:DLT-030 */
	it("digests a key outside the declared sections identically", async () => {
		const before = await materializeAt(workspace.dir);
		await writeFile(
			path.join(workspace.dir, ".project-map.yaml"),
			CONFIG.replace("output:", "sections:\n  - contexts\noutput:"),
			"utf8",
		);

		const after = await materializeAt(workspace.dir);

		expect(after.digest).toBe(before.digest);
	});

	/* @covers project-map:DLT-030 */
	it("digests a change inside a declared section differently", async () => {
		const before = await materializeAt(workspace.dir);
		await writeFile(
			path.join(workspace.dir, ".project-map.yaml"),
			CONFIG.replace(
				'    include: ["**/*.py"]',
				'    include: ["**/*.py"]\n    exclude: ["matches-nothing/**"]',
			),
			"utf8",
		);

		const after = await materializeAt(workspace.dir);

		expect(after.digest).not.toBe(before.digest);
	});

	/* @covers project-map:CTR-004 */
	it("digests a changed source differently", async () => {
		const before = await materializeAt(workspace.dir);
		await writeFile(
			path.join(workspace.dir, "app", "client.py"),
			"URL = 'y'\n",
			"utf8",
		);

		const after = await materializeAt(workspace.dir);

		expect(after.digest).not.toBe(before.digest);
	});
});

describe("analysis unit locator anchoring", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
		await seed(workspace.dir);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-004 */
	it("rejects a spec locator that leaves the anchored root", async () => {
		await expect(
			materializeAt(workspace.dir, ["repo:../outside/openapi.yaml"]),
		).rejects.toThrow(ConfigTimeError);
	});

	/* @covers project-map:CTR-004 */
	it("rejects a monorepo locator with no root supplied", async () => {
		await expect(
			materializeAt(workspace.dir, ["monorepo:some/service/openapi.yaml"]),
		).rejects.toThrow(/monorepo_root_unresolved/);
	});

	/* @covers project-map:CTR-004 */
	/* @covers project-map:POL-003 */
	it("rejects a spec locator that escapes the root through a symlink", async () => {
		const outside = await createWorkspace();
		await writeFile(path.join(outside.dir, "leaked.yaml"), "openapi: 3.1.0\n");
		await symlink(
			path.join(outside.dir, "leaked.yaml"),
			path.join(workspace.dir, "linked.yaml"),
		);

		const rejection = expect(
			materializeAt(workspace.dir, ["repo:linked.yaml"]),
		).rejects.toThrow(/spec_locator_outside_repo/);
		await rejection;
		await outside.dispose();
	});
});
