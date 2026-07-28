import { describe, expect, it } from "vitest";
import type {
	EndpointFact,
	OutboundOperationFact,
} from "../../src/core/domain/facts/fact.js";
import { factId } from "../../src/features/detect/canonical/fact-id.js";

const SCHEMA_VERSION = "1";
const REPOSITORY = "midas";

function anOutboundFact(
	overrides: Partial<OutboundOperationFact> = {},
): OutboundOperationFact {
	return {
		id: "",
		kind: "outbound_operation",
		mechanism: "http",
		operation: {
			variants: [
				{
					http: {
						method: { kind: "literal", value: "POST" },
						path: { kind: "literal", value: "/webapi/Register" },
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
		},
		owner_operation: "PaygineClient.register",
		call_site: {
			path: "interactions/paygine.py",
			start_byte: 4120,
			end_byte: 4171,
		},
		module_id: null,
		callee_operation: null,
		contract_ref: null,
		provenance: ["declared"],
		resolution: "resolved",
		evidence: [
			{
				path: "interactions/paygine.py",
				start_byte: 4120,
				end_byte: 4171,
				role: "call",
			},
		],
		...overrides,
	};
}

function anEndpointFact(overrides: Partial<EndpointFact> = {}): EndpointFact {
	return {
		id: "",
		kind: "endpoint",
		mechanism: "http",
		operation: {
			variants: [
				{
					http: {
						method: { kind: "literal", value: "GET" },
						path: { kind: "literal", value: "/v2/orders" },
					},
				},
			],
		},
		handler: { kind: "unknown", reason: "cross_boundary" },
		contract_refs: [],
		provenance: ["openapi"],
		resolution: "resolved",
		evidence: [
			{
				path: "openapi/openapi.yaml",
				start_byte: 0,
				end_byte: 1,
				role: "inventory",
			},
		],
		...overrides,
	};
}

function idOf(fact: EndpointFact | OutboundOperationFact): string {
	return factId({
		fact,
		schemaVersion: SCHEMA_VERSION,
		repositoryIdentity: REPOSITORY,
	});
}

describe("fact identity", () => {
	/* @covers project-map:CTR-008 */
	it("is a sha256 prefix followed by lowercase hex", () => {
		expect(idOf(anOutboundFact())).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	/* @covers project-map:CTR-008 */
	it("ignores provenance, evidence and resolution", () => {
		const base = anOutboundFact();
		const enriched = anOutboundFact({
			provenance: ["transport", "declared"],
			resolution: "unresolved",
			evidence: [
				{ path: "other.py", start_byte: 1, end_byte: 2, role: "declaration" },
			],
		});

		expect(idOf(enriched)).toBe(idOf(base));
	});

	/* @covers project-map:CTR-008 */
	/* @covers project-map:BEH-011 */
	it("ignores which ladder step bound the destination", () => {
		const viaInstance = anOutboundFact();
		const viaDeclaration = anOutboundFact({
			operation: {
				variants: [
					{
						http: {
							method: { kind: "literal", value: "POST" },
							path: { kind: "literal", value: "/webapi/Register" },
							destination: {
								kind: "config_ref",
								ref: {
									kind: "config_ref",
									ref: { declaration: "atlas", path_segments: ["base_url"] },
								},
								binding: "owner_declaration",
							},
						},
					},
				],
			},
		});

		expect(idOf(viaDeclaration)).toBe(idOf(viaInstance));
	});

	/* @covers project-map:CTR-008 */
	it("separates two call sites of one operation", () => {
		const first = anOutboundFact();
		const second = anOutboundFact({
			call_site: {
				path: "interactions/paygine.py",
				start_byte: 9000,
				end_byte: 9051,
			},
		});

		expect(idOf(second)).not.toBe(idOf(first));
	});
});

describe("endpoint fact identity", () => {
	/* @covers project-map:CTR-006 */
	it("treats the handler as enrichment rather than identity", () => {
		const withoutHandler = anEndpointFact();
		const withHandler = anEndpointFact({
			handler: {
				kind: "symbol",
				declaration: { path: "api/v2.go", start_byte: 10, end_byte: 20 },
				display_name: "V2Api.GetOrders",
			},
		});

		expect(idOf(withHandler)).toBe(idOf(withoutHandler));
	});

	/* @covers project-map:CTR-006 */
	it("keeps two unresolved registrations at distinct anchors apart", () => {
		const unresolvedOperation = {
			variants: [
				{
					http: {
						method: { kind: "unknown", reason: "dynamic" } as const,
						path: { kind: "unknown", reason: "dynamic" } as const,
					},
				},
			],
		};
		const first = anEndpointFact({
			operation: unresolvedOperation,
			resolution: "unresolved",
			evidence: [
				{
					path: "router.go",
					start_byte: 100,
					end_byte: 120,
					role: "registration",
				},
			],
		});
		const second = anEndpointFact({
			operation: unresolvedOperation,
			resolution: "unresolved",
			evidence: [
				{
					path: "router.go",
					start_byte: 300,
					end_byte: 320,
					role: "registration",
				},
			],
		});

		expect(idOf(second)).not.toBe(idOf(first));
	});

	/* @covers project-map:CTR-006 */
	it("merges two resolved registrations that share a route and method", () => {
		const first = anEndpointFact({
			evidence: [
				{
					path: "router.go",
					start_byte: 100,
					end_byte: 120,
					role: "registration",
				},
			],
		});
		const second = anEndpointFact({
			provenance: ["router"],
			evidence: [
				{
					path: "router.go",
					start_byte: 300,
					end_byte: 320,
					role: "registration",
				},
			],
		});

		expect(idOf(second)).toBe(idOf(first));
	});
});
