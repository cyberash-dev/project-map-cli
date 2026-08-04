import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnosticsOf } from "../support/operations.js";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

type Core = {
	code: string;
	canonical_callee: string;
	canonical_call_shape: { arity: number; receiver_type: string | null };
};

const BASELINE = ".project-map/unclassified-baseline.json";

/** Every core the fixture emits, which is what a covering baseline holds. */
const COVERING: readonly Core[] = [
	{
		code: "external_call_unclassified",
		canonical_callee: "requests.Request",
		canonical_call_shape: { arity: 2, receiver_type: null },
	},
	{
		code: "external_call_unclassified",
		canonical_callee: "requests.utils.default_headers",
		canonical_call_shape: { arity: 0, receiver_type: null },
	},
	{
		code: "external_call_unclassified",
		canonical_callee: "self.retry",
		canonical_call_shape: { arity: 1, receiver_type: "OrdersClient" },
	},
	{
		code: "external_call_unclassified",
		canonical_callee: "self.trace",
		canonical_call_shape: { arity: 1, receiver_type: "OrdersClient" },
	},
];

async function withBaseline(
	dir: string,
	suppressed: readonly Core[],
): Promise<void> {
	const configPath = path.join(dir, ".project-map.yaml");
	const config = await readFile(configPath, "utf8");
	if (!config.includes("unclassified_baseline")) {
		await writeFile(
			configPath,
			config.replace(
				"  outbound:\n",
				`  unclassified_baseline: ${BASELINE}\n  outbound:\n`,
			),
			"utf8",
		);
	}
	await writeFile(
		path.join(dir, BASELINE),
		`${JSON.stringify({ schema_version: "1", suppressed })}\n`,
		"utf8",
	);
}

async function artifactOf(dir: string): Promise<string> {
	return readFile(path.join(dir, ".project-map/facts.json"), "utf8");
}

describe("the unclassified ratchet", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-outbound");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-014 */
	it("passes where the baseline covers every diagnostic", async () => {
		await withBaseline(workspace.dir, COVERING);

		expect(await runCli(workspace.dir, ["build", "--strict"])).toBe(0);
	});

	/* @covers project-map:BEH-014 */
	/* @covers project-map:DLT-017 */
	it("exits 6 on a diagnostic the baseline does not list", async () => {
		await withBaseline(workspace.dir, COVERING.slice(1));

		expect(await runCli(workspace.dir, ["build", "--strict"])).toBe(6);
	});

	/* @covers project-map:BEH-014 */
	it("exits 6 on a baseline entry that suppresses nothing", async () => {
		await withBaseline(workspace.dir, [
			...COVERING,
			{
				code: "external_call_unclassified",
				canonical_callee: "self.long_gone",
				canonical_call_shape: { arity: 0, receiver_type: "OrdersClient" },
			},
		]);

		expect(await runCli(workspace.dir, ["build", "--strict"])).toBe(6);
	});

	/* @covers project-map:BEH-014 */
	it("ratchets against the empty set where no baseline is configured", async () => {
		expect(await runCli(workspace.dir, ["build", "--strict"])).toBe(6);
	});

	/* @covers project-map:CTR-010 */
	it("leaves the artifact byte-identical whatever the baseline holds", async () => {
		await withBaseline(workspace.dir, COVERING);
		await runCli(workspace.dir, ["build", "--strict"]);
		const covered = await artifactOf(workspace.dir);

		await withBaseline(workspace.dir, []);
		await runCli(workspace.dir, ["build", "--strict"]);

		expect(await artifactOf(workspace.dir)).toBe(covered);
	});

	/* @covers project-map:CTR-010 */
	it("exits 5 on a baseline that does not parse", async () => {
		await withBaseline(workspace.dir, COVERING);
		await writeFile(path.join(workspace.dir, BASELINE), "{ not json", "utf8");

		expect(await runCli(workspace.dir, ["build", "--strict"])).toBe(5);
	});

	/* @covers project-map:BEH-014 */
	/* @covers project-map:DLT-017 */
	it("leaves a build without the flag from reading the baseline at all", async () => {
		await withBaseline(workspace.dir, COVERING);
		/* A baseline that would fail the run if it were read, so passing
		 * proves the file was not opened rather than that it satisfied. */
		await writeFile(path.join(workspace.dir, BASELINE), "{ not json", "utf8");

		expect(await runCli(workspace.dir, ["build"])).toBe(0);
		expect(await diagnosticsOf(workspace.dir)).toHaveLength(COVERING.length);
	});
});
