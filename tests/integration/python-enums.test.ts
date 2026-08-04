import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createWorkspace,
	runCli,
	type Workspace,
} from "../support/workspace.js";

describe("an enum nested in a class", () => {
	let workspace: Workspace;

	beforeEach(async () => {
		workspace = await createWorkspace("python-aiohttp-minimal");
		await runCli(workspace.dir, ["build"]);
	});
	afterEach(async () => {
		await workspace.dispose();
	});

	/* @covers project-map:BEH-015 */
	/* @covers project-map:DLT-018 */
	it("names it by the chain that reaches it", async () => {
		const document = await readFile(
			path.join(workspace.dir, "PROJECT_MAP.md"),
			"utf8",
		);

		expect(document).toContain("### `PaymentError.ReasonCode`");
		expect(document).toContain("### `RefundError.ReasonCode`");
		expect(document).not.toContain("### `ReasonCode`");
	});

	/* @covers project-map:BEH-015 */
	it("leaves a module-level enum named as it was declared", async () => {
		const document = await readFile(
			path.join(workspace.dir, "PROJECT_MAP.md"),
			"utf8",
		);

		expect(document).toContain("### `TransactionStatus`");
	});
});
