import { describe, expect, it, onTestFinished } from "vitest";
import { diagnosticsOf } from "../support/operations.js";
import { createWorkspace, runCli } from "../support/workspace.js";

async function built(fixture: string): Promise<string> {
	const workspace = await createWorkspace(fixture);
	onTestFinished(() => workspace.dispose());
	await runCli(workspace.dir, ["build"]);
	return workspace.dir;
}

function codesOf(
	diagnostics: readonly { readonly code: string }[],
): readonly string[] {
	return diagnostics.map((entry) => entry.code);
}

describe("an inventory the code half accounts for", () => {
	/* @covers project-map:DLT-042 */
	it("raises neither direction of the cross-check", async () => {
		const codes = codesOf(await diagnosticsOf(await built("go-chi-generated")));

		expect(codes).not.toContain("openapi_route_not_in_code");
		expect(codes).not.toContain("router_route_not_in_openapi");
	});
});

describe("an inventory and a code half that drift", () => {
	/* @covers project-map:DLT-042 */
	it("names the served route no registration accounts for", async () => {
		const diagnostics = await diagnosticsOf(await built("go-openapi-drift"));

		expect(diagnostics).toContainEqual({
			code: "openapi_route_not_in_code",
			callee: "GET /api/only-in-spec",
			count: 1,
		});
	});

	/* @covers project-map:DLT-042 */
	it("names the proven route the inventory does not declare", async () => {
		const diagnostics = await diagnosticsOf(await built("go-openapi-drift"));

		expect(diagnostics).toContainEqual({
			code: "router_route_not_in_openapi",
			callee: "GET /api/only-in-code",
			count: 1,
		});
	});
});

describe("a registration that reached no entry point", () => {
	/* @covers project-map:DLT-042 */
	it("is not reported as a route the inventory does not declare", async () => {
		const codes = codesOf(
			await diagnosticsOf(await built("go-chi-unanchored")),
		);

		expect(codes).toContain("unanchored_router");
		expect(codes).not.toContain("router_route_not_in_openapi");
	});
});
