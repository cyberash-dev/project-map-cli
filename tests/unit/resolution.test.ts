import { describe, expect, it } from "vitest";
import type {
	Mechanism,
	Operation,
	OutboundOperationFact,
} from "../../src/core/domain/facts/fact.js";
import { deriveResolution } from "../../src/features/detect/merge/resolution.js";
import { isDeferredToLinker } from "../../src/features/detect/outbound/library.js";

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

function outboundFact(
	operation: Operation,
	mechanism: Mechanism = "http",
): OutboundOperationFact {
	return {
		id: "outbound",
		kind: "outbound_operation",
		mechanism,
		operation,
		owner_operation: "Client.request",
		call_site: { path: "client.py", start_byte: 0, end_byte: 1 },
		module_id: "client",
		callee_operation: null,
		contract_ref: null,
		provenance: ["declared"],
		resolution: "unresolved",
		evidence: [],
	};
}

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

describe("library deferral", () => {
	/* @covers project-map:BEH-012 */
	it("defers when every nested unknown belongs to the library", () => {
		const fact = outboundFact({
			variants: [
				{
					http: {
						method: {
							kind: "template",
							parts: [{ kind: "unknown", reason: "operation_in_library" }],
						},
						path: {
							kind: "choice",
							alternatives: [
								{
									kind: "unknown",
									reason: "operation_in_library_root",
								},
							],
						},
						destination: {
							kind: "config_ref",
							ref: {
								kind: "template",
								parts: [
									{
										kind: "unknown",
										reason: "operation_in_library",
									},
								],
							},
							binding: "instance",
						},
					},
				},
			],
		});

		expect(isDeferredToLinker(fact)).toBe(true);
	});

	/* @covers project-map:BEH-012 */
	it("keeps mixed nested library and local unknowns in local coverage", () => {
		const fact = outboundFact(
			{
				variants: [
					{
						queue: {
							action: "produce",
							topic: {
								kind: "choice",
								alternatives: [
									{
										kind: "unknown",
										reason: "operation_in_library",
									},
									{ kind: "unknown", reason: "dynamic" },
								],
							},
						},
					},
				],
			},
			"queue",
		);

		expect(isDeferredToLinker(fact)).toBe(false);
	});
});
