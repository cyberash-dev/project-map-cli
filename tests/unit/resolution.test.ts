import { describe, expect, it } from "vitest";
import type { Operation } from "../../src/core/domain/facts/fact.js";
import { deriveResolution } from "../../src/features/detect/merge/resolution.js";

const LITERAL_GET: Operation = {
	variants: [
		{
			http: {
				method: { kind: "literal", value: "GET" },
				path: { kind: "literal", value: "/orders" },
			},
		},
	],
};

describe("resolution derivation", () => {
	/* @covers project-map:CTR-006 */
	it("calls a single fully proven variant resolved", () => {
		expect(
			deriveResolution({ operation: LITERAL_GET, requiresDestination: false }),
		).toBe("resolved");
	});

	/* @covers project-map:CTR-006 */
	/* @covers project-map:INV-005 */
	it("calls an unknown in a required field unresolved", () => {
		const operation: Operation = {
			variants: [
				{
					http: {
						method: { kind: "literal", value: "GET" },
						path: { kind: "unknown", reason: "dynamic" },
					},
				},
			],
		};

		expect(deriveResolution({ operation, requiresDestination: false })).toBe(
			"unresolved",
		);
	});

	/* @covers project-map:CTR-006 */
	it("calls two distinct variants ambiguous rather than conflicting", () => {
		const operation: Operation = {
			variants: [
				{
					http: {
						method: { kind: "literal", value: "GET" },
						path: { kind: "literal", value: "/a" },
					},
				},
				{
					http: {
						method: { kind: "literal", value: "POST" },
						path: { kind: "literal", value: "/b" },
					},
				},
			],
		};

		expect(deriveResolution({ operation, requiresDestination: false })).toBe(
			"ambiguous",
		);
	});
});

describe("resolution of required fields", () => {
	/* @covers project-map:CTR-006 */
	it("treats a config reference and a template as proven values", () => {
		const operation: Operation = {
			variants: [
				{
					http: {
						method: { kind: "literal", value: "GET" },
						path: { kind: "template", parts: ["/orders/", "{}"] },
						destination: {
							kind: "config_ref",
							ref: {
								kind: "config_ref",
								ref: { declaration: "atlas", path_segments: ["base_url"] },
							},
							binding: "instance",
						},
					},
				},
			],
		};

		expect(deriveResolution({ operation, requiresDestination: true })).toBe(
			"resolved",
		);
	});

	/* @covers project-map:CTR-006 */
	/* @covers project-map:INV-005 */
	it("calls a missing destination unresolved only where one is required", () => {
		const operation: Operation = {
			variants: [
				{
					http: {
						method: { kind: "literal", value: "POST" },
						path: { kind: "literal", value: "/x" },
						destination: { kind: "unknown", reason: "cross_boundary" },
					},
				},
			],
		};

		expect(deriveResolution({ operation, requiresDestination: true })).toBe(
			"unresolved",
		);
		expect(deriveResolution({ operation, requiresDestination: false })).toBe(
			"resolved",
		);
	});

	/* @covers project-map:CTR-006 */
	it("calls an unknown queue topic unresolved", () => {
		const operation: Operation = {
			variants: [
				{
					queue: {
						action: "produce",
						topic: { kind: "unknown", reason: "dynamic" },
					},
				},
			],
		};

		expect(deriveResolution({ operation, requiresDestination: false })).toBe(
			"unresolved",
		);
	});
});
