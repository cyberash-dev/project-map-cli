import { describe, expect, it } from "vitest";
import { YamlOpenApiReader } from "../../src/infrastructure/openapi/yaml-openapi-reader.js";

function read(text: string) {
	return new YamlOpenApiReader().read({ locator: "repo:spec.yaml", text });
}

const THREE_ONE = [
	"openapi: 3.1.0",
	"info:",
	"  title: sample",
	"  version: '1'",
	"servers:",
	'  - url: "/v2"',
	"paths:",
	"  /orders:",
	"    get:",
	"      operationId: listOrders",
	"    post:",
	"      operationId: createOrder",
	"  /orders/{orderId}:",
	"    get:",
	"      operationId: getOrder",
	"",
].join("\n");

describe("openapi reader", () => {
	/* @covers project-map:CTR-005 */
	it("reads every path and method of a 3.1 document", () => {
		const parsed = read(THREE_ONE);

		expect(parsed.kind).toBe("readable");
		expect(
			parsed.kind === "readable"
				? parsed.operations.map((op) => `${op.method} ${op.path}`)
				: [],
		).toEqual(["GET /orders", "POST /orders", "GET /orders/{orderId}"]);
	});

	/* @covers project-map:CTR-005 */
	it("ignores servers for path identity, because they name environments", () => {
		const parsed = read(THREE_ONE);

		expect(parsed.kind === "readable" ? parsed.basePath : "unset").toBe("");
	});

	/* @covers project-map:CTR-005 */
	it("carries an operation id that is unique in the document", () => {
		const parsed = read(THREE_ONE);

		expect(
			parsed.kind === "readable" ? parsed.operations[0]?.operationId : null,
		).toBe("listOrders");
	});

	/* @covers project-map:CTR-005 */
	it("drops an operation id that the document repeats", () => {
		const parsed = read(
			[
				"openapi: 3.1.0",
				"paths:",
				"  /a:",
				"    get:",
				"      operationId: shared",
				"  /b:",
				"    get:",
				"      operationId: shared",
				"",
			].join("\n"),
		);

		expect(
			parsed.kind === "readable"
				? parsed.operations.map((op) => op.operationId)
				: null,
		).toEqual([null, null]);
	});
});

describe("openapi reader rejections", () => {
	/* @covers project-map:CTR-005 */
	it("resolves a local path-item reference", () => {
		const parsed = read(
			[
				"openapi: 3.1.0",
				"paths:",
				"  /orders:",
				"    $ref: '#/components/pathItems/orders'",
				"components:",
				"  pathItems:",
				"    orders:",
				"      get:",
				"        operationId: listOrders",
				"",
			].join("\n"),
		);

		expect(
			parsed.kind === "readable"
				? parsed.operations.map((op) => `${op.method} ${op.path}`)
				: [],
		).toEqual(["GET /orders"]);
	});

	/* @covers project-map:CTR-005 */
	it("reports a Swagger 2.0 document as unreadable", () => {
		const parsed = read(
			["swagger: '2.0'", "basePath: /v1", "paths: {}", ""].join("\n"),
		);

		expect(parsed.kind).toBe("unreadable");
	});

	/* @covers project-map:CTR-005 */
	it("reports a document with no version marker as unreadable", () => {
		const parsed = read(["paths:", "  /a:", "    get: {}", ""].join("\n"));

		expect(parsed.kind).toBe("unreadable");
	});

	/* @covers project-map:CTR-005 */
	it("reports unparsable text as unreadable rather than throwing", () => {
		const parsed = read("this: is: not: yaml:\n  - [\n");

		expect(parsed.kind).toBe("unreadable");
	});
});
