import { describe, expect, it } from "vitest";
import type { ValueIr } from "../../src/core/domain/facts/value-ir.js";
import { canonicalPathIr } from "../../src/features/detect/openapi/path-grammar.js";

const HOLE: ValueIr = { kind: "unknown", reason: "dynamic" };

function literal(value: string): ValueIr {
	return { kind: "literal", value };
}

describe("canonical path over unproven components", () => {
	/* @covers project-map:CTR-007 */
	it("collapses to a literal when every component folded", () => {
		expect(canonicalPathIr([literal("/v1"), literal("/orders")])).toEqual(
			literal("/v1/orders"),
		);
	});

	/* @covers project-map:CTR-007 */
	it("keeps an unproven prefix as a typed hole of its own segment", () => {
		expect(canonicalPathIr([HOLE, literal("/loose")])).toEqual({
			kind: "template",
			parts: ["/", HOLE, "/loose"],
		});
	});

	/* @covers project-map:CTR-007 */
	it("canonicalizes the literal runs around a hole", () => {
		expect(
			canonicalPathIr([literal("/v1//"), HOLE, literal("/{id}/?page=2")]),
		).toEqual({
			kind: "template",
			parts: ["/v1/", HOLE, "/{}"],
		});
	});

	/* @covers project-map:CTR-007 */
	it("keeps a hole that sits inside a segment inside that segment", () => {
		expect(canonicalPathIr([literal("/v1/order-"), HOLE])).toEqual({
			kind: "template",
			parts: ["/v1/order-", HOLE],
		});
	});
});
