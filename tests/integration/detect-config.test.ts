import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../../src/core/ports/config.port.js";
import { CosmiconfigLoader } from "../../src/infrastructure/config/loader.js";
import { createWorkspace, type Workspace } from "../support/workspace.js";

const MINIMAL = "project:\n  name: one\n  language: python\n";

async function loadYaml(dir: string, yaml: string): Promise<ResolvedConfig> {
	await writeFile(path.join(dir, ".project-map.yaml"), yaml, "utf8");
	const config = await new CosmiconfigLoader().load(dir, null);
	if (!config) {
		throw new Error("config did not load");
	}
	return config;
}

describe("detection configuration", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-002 */
	/* @covers project-map:DLT-004 */
	it("defaults the analysis unit and the facts path on a minimal document", async () => {
		const config = await loadYaml(workspace.dir, MINIMAL);

		expect(config.analysisUnit.sources.include).toEqual([]);
		expect(config.analysisUnit.sources.exclude).toEqual([]);
		expect(config.analysisUnit.configDeclarations).toEqual([]);
		expect(config.output.facts).toBeNull();
		expect(config.repositoryIdentity).toBeNull();
	});

	/* @covers project-map:CTR-004 */
	/* @covers project-map:DLT-004 */
	it("resolves a declared analysis unit independently of the top-level exclude", async () => {
		const config = await loadYaml(
			workspace.dir,
			`${MINIMAL}repository_identity: midas\nexclude:\n  - "**/base.py"\nanalysis_unit:\n  sources:\n    include:\n      - "**/*.py"\n    exclude:\n      - "**/vendor/**"\n  config_declarations:\n    - "settings/**"\noutput:\n  facts: .project-map/facts.json\n`,
		);

		expect(config.exclude).toContain("**/base.py");
		expect(config.analysisUnit.sources.exclude).toEqual(["**/vendor/**"]);
		expect(config.analysisUnit.configDeclarations).toEqual(["settings/**"]);
	});

	/* @covers project-map:ASM-002 */
	/* @covers project-map:DLT-004 */
	it("rejects a document that emits facts without a repository identity", async () => {
		await expect(
			loadYaml(
				workspace.dir,
				`${MINIMAL}output:\n  facts: .project-map/facts.json\n`,
			),
		).rejects.toThrow(/repository_identity/);
	});

	/* @covers project-map:ASM-002 */
	it("accepts a detection section without a repository identity when no facts are emitted", async () => {
		const config = await loadYaml(
			workspace.dir,
			`${MINIMAL}sections:\n  - detection_coverage\n`,
		);

		expect(config.repositoryIdentity).toBeNull();
	});

	/* @covers project-map:ASM-002 */
	it("rejects a detector without a repository identity", async () => {
		await expect(
			loadYaml(
				workspace.dir,
				`${MINIMAL}detect:\n  inbound:\n    routers:\n      - dsl: router\n        path_arg: { kind: arg, selector: 0 }\n`,
			),
		).rejects.toThrow(/repository_identity/);
	});

	/* @covers project-map:ASM-002 */
	/* @covers project-map:DLT-004 */
	it("accepts a document that emits no facts and declares no identity", async () => {
		const config = await loadYaml(workspace.dir, MINIMAL);

		expect(config.output.facts).toBeNull();
	});

	/* @covers project-map:CTR-002 */
	it("still rejects an unrecognized top-level key", async () => {
		await expect(
			loadYaml(workspace.dir, `${MINIMAL}analysis_units: {}\n`),
		).rejects.toThrow();
	});
});

describe("openapi configuration", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-005 */
	/* @covers project-map:DLT-005 */
	it("resolves a served specification with its contract id and mount", async () => {
		const config = await loadYaml(
			workspace.dir,
			`${MINIMAL}repository_identity: midas\nopenapi:\n  serves:\n    - spec: repo:openapi/openapi.yaml\n      contract_id: midas.public.v2\n      mount: /v2\n`,
		);

		expect(config.openapi.serves).toEqual([
			{
				spec: "repo:openapi/openapi.yaml",
				contractId: "midas.public.v2",
				mount: "/v2",
			},
		]);
	});

	/* @covers project-map:CTR-005 */
	it("defaults the mount to null when the specification paths are absolute", async () => {
		const config = await loadYaml(
			workspace.dir,
			`${MINIMAL}repository_identity: midas\nopenapi:\n  serves:\n    - spec: repo:openapi/openapi.yaml\n      contract_id: midas.public.v2\n`,
		);

		expect(config.openapi.serves[0]?.mount).toBeNull();
	});

	/* @covers project-map:CTR-005 */
	it("rejects a served specification with no contract id", async () => {
		await expect(
			loadYaml(
				workspace.dir,
				`${MINIMAL}repository_identity: midas\nopenapi:\n  serves:\n    - spec: repo:openapi/openapi.yaml\n`,
			),
		).rejects.toThrow(/contract_id/);
	});

	/* @covers project-map:ASM-002 */
	/* @covers project-map:DLT-005 */
	it("rejects a declared section with no repository identity", async () => {
		await expect(
			loadYaml(
				workspace.dir,
				`${MINIMAL}openapi:\n  serves:\n    - spec: repo:openapi/openapi.yaml\n      contract_id: midas.public.v2\n`,
			),
		).rejects.toThrow(/repository_identity/);
	});

	/* @covers project-map:CTR-005 */
	it("defaults both sections to empty on a document that declares neither", async () => {
		const config = await loadYaml(workspace.dir, MINIMAL);

		expect(config.openapi.serves).toEqual([]);
		expect(config.openapi.consumes).toEqual([]);
	});
});
