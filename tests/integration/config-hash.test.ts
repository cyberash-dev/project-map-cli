import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CosmiconfigLoader } from "../../src/infrastructure/config/loader.js";
import { createWorkspace, type Workspace } from "../support/workspace.js";

async function hashOf(dir: string, yaml: string): Promise<string> {
	await writeFile(path.join(dir, ".project-map.yaml"), yaml, "utf8");
	const config = await new CosmiconfigLoader().load(dir, null);
	if (!config) {
		throw new Error("config did not load");
	}
	return config.configHash;
}

describe("config hash", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace();
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:CTR-002 */
	/* @covers project-map:DLT-001 */
	it("changes when a nested key changes", async () => {
		const base = await hashOf(
			workspace.dir,
			"project:\n  name: one\n  language: python\noutput:\n  markdown: PROJECT_MAP.md\n",
		);
		const renamed = await hashOf(
			workspace.dir,
			"project:\n  name: two\n  language: python\noutput:\n  markdown: PROJECT_MAP.md\n",
		);
		const rerouted = await hashOf(
			workspace.dir,
			"project:\n  name: one\n  language: python\noutput:\n  markdown: OTHER.md\n",
		);

		expect(renamed).not.toBe(base);
		expect(rerouted).not.toBe(base);
		expect(renamed).not.toBe(rerouted);
	});

	/* @covers project-map:CTR-002 */
	/* @covers project-map:DLT-001 */
	it("ignores the order keys are written in", async () => {
		const straight = await hashOf(
			workspace.dir,
			"project:\n  name: one\n  language: python\nroot: src\n",
		);
		const shuffled = await hashOf(
			workspace.dir,
			"root: src\nproject:\n  language: python\n  name: one\n",
		);

		expect(shuffled).toBe(straight);
	});
});
