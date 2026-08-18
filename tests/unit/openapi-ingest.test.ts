import { describe, expect, it } from "vitest";
import type { AnalysisUnit } from "../../src/core/ports/analysis-unit.port.js";
import type { ServedContract } from "../../src/core/ports/config.port.js";
import { ingestServedContracts } from "../../src/features/detect/openapi/ingest.js";
import { YamlOpenApiReader } from "../../src/infrastructure/openapi/yaml-openapi-reader.js";

const ORDERS_SPEC = [
	"openapi: 3.1.0",
	"paths:",
	"  /orders:",
	"    get:",
	"      operationId: listOrders",
	"  /orders/{orderId}:",
	"    get: {}",
	"",
].join("\n");

function aUnit(
	specs: readonly { locator: string; text: string }[],
): AnalysisUnit {
	return {
		repositoryIdentity: "orders-api",
		sources: [],
		configDocuments: [],
		specs,
		registryVersion: "test",
		digest: "sha256:unit",
	};
}

function serves(
	spec: string,
	contractId: string,
	mount: string | null = null,
): ServedContract {
	return { spec, contractId, mount };
}

function ingest(
	unit: AnalysisUnit,
	entries: readonly ServedContract[],
): ReturnType<typeof ingestServedContracts> {
	return ingestServedContracts({
		unit,
		serves: entries,
		reader: new YamlOpenApiReader(),
		schemaVersion: "1",
	});
}

describe("openapi inventory ingestion", () => {
	/* @covers project-map:BEH-007 */
	it("emits one fact per declared path and method", () => {
		const unit = aUnit([{ locator: "repo:openapi.yaml", text: ORDERS_SPEC }]);

		const result = ingest(unit, [serves("repo:openapi.yaml", "orders-api.v2")]);

		expect(result.facts).toHaveLength(2);
		expect(
			result.facts.every((fact) => fact.provenance.includes("openapi")),
		).toBe(true);
	});

	/* @covers project-map:BEH-007 */
	it("prepends the declared mount exactly once", () => {
		const unit = aUnit([{ locator: "repo:openapi.yaml", text: ORDERS_SPEC }]);

		const result = ingest(unit, [
			serves("repo:openapi.yaml", "orders-api.v2", "/v2"),
		]);

		const paths = result.facts.flatMap((fact) =>
			fact.operation.variants.map((variant) =>
				"http" in variant && variant.http.path.kind === "literal"
					? variant.http.path.value
					: "",
			),
		);
		expect(paths.sort()).toEqual(["/v2/orders", "/v2/orders/{}"]);
	});

	/* @covers project-map:BEH-007 */
	it("falls back to method and canonical path where the document names no operation", () => {
		const unit = aUnit([{ locator: "repo:openapi.yaml", text: ORDERS_SPEC }]);

		const result = ingest(unit, [serves("repo:openapi.yaml", "orders-api.v2")]);

		const ids = result.facts
			.flatMap((fact) => fact.contract_refs.map((ref) => ref.operation_id))
			.sort();
		expect(ids).toEqual(["GET /orders/{}", "listOrders"]);
	});
});

describe("openapi inventory reconciliation", () => {
	/* @covers project-map:BEH-007 */
	/* @covers project-map:DLT-042 */
	it("leaves the handler unknown and reconciles nothing on its own", () => {
		const unit = aUnit([{ locator: "repo:openapi.yaml", text: ORDERS_SPEC }]);

		const result = ingest(unit, [serves("repo:openapi.yaml", "orders-api.v2")]);

		expect(result.facts.every((fact) => fact.handler.kind === "unknown")).toBe(
			true,
		);
		expect(
			result.diagnostics.filter(
				(diagnostic) => diagnostic.code === "openapi_route_not_in_code",
			),
		).toHaveLength(0);
	});

	/* @covers project-map:BEH-007 */
	/* @covers project-map:CTR-006 */
	it("carries one route exposed under two contracts as one fact with both refs", () => {
		const unit = aUnit([
			{ locator: "repo:a.yaml", text: ORDERS_SPEC },
			{ locator: "repo:b.yaml", text: ORDERS_SPEC },
		]);

		const result = ingest(unit, [
			serves("repo:a.yaml", "orders-api.v2"),
			serves("repo:b.yaml", "orders-api.internal"),
		]);

		expect(result.facts).toHaveLength(2);
		const listOrders = result.facts.find((fact) =>
			fact.contract_refs.some((ref) => ref.operation_id === "listOrders"),
		);
		expect(listOrders?.contract_refs.map((ref) => ref.contract_id)).toEqual([
			"orders-api.internal",
			"orders-api.v2",
		]);
		expect(listOrders?.resolution).toBe("resolved");
	});

	/* @covers project-map:CTR-006 */
	it("marks one contract declaring a route twice as conflicting", () => {
		const unit = aUnit([
			{ locator: "repo:a.yaml", text: ORDERS_SPEC },
			{ locator: "repo:b.yaml", text: ORDERS_SPEC },
		]);

		const result = ingest(unit, [
			serves("repo:a.yaml", "orders-api.v2"),
			serves("repo:b.yaml", "orders-api.v2"),
		]);

		expect(
			result.facts.every((fact) => fact.resolution === "conflicting"),
		).toBe(true);
	});

	/* @covers project-map:BEH-007 */
	it("diagnoses an unreadable specification instead of emitting facts", () => {
		const unit = aUnit([
			{ locator: "repo:old.yaml", text: "swagger: '2.0'\npaths: {}\n" },
		]);

		const result = ingest(unit, [serves("repo:old.yaml", "legacy")]);

		expect(result.facts).toHaveLength(0);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"openapi_spec_unreadable",
		]);
	});

	/* @covers project-map:BEH-007 */
	it("diagnoses a served entry whose specification is not in the unit", () => {
		const result = ingest(aUnit([]), [serves("repo:missing.yaml", "gone")]);

		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"openapi_spec_unreadable",
		]);
	});

	/* @covers project-map:CTR-008 */
	it("orders facts by their identity", () => {
		const unit = aUnit([{ locator: "repo:openapi.yaml", text: ORDERS_SPEC }]);

		const result = ingest(unit, [serves("repo:openapi.yaml", "orders-api.v2")]);

		const ids = result.facts.map((fact) => fact.id);
		expect([...ids].sort()).toEqual(ids);
	});
});
