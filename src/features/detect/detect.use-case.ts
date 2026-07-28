import type { Diagnostic } from "../../core/domain/facts/diagnostic.js";
import type { DetectionFact } from "../../core/domain/facts/fact.js";
import type { AnalysisUnit } from "../../core/ports/analysis-unit.port.js";
import type { OpenApiConfig } from "../../core/ports/config.port.js";
import type { IOpenApiReader } from "../../core/ports/openapi.port.js";
import type { ISourceParser } from "../../core/ports/parser.port.js";
import type { DetectConfig } from "../../core/ports/config.port.js";
import { detectPythonDslRoutes } from "./inbound/python-dsl.js";
import { finalizeEndpointFacts } from "./merge/merge-table.js";
import { ingestServedContracts } from "./openapi/ingest.js";
import { FACTS_SCHEMA_VERSION } from "./render/artifact.js";

export type FactSet = {
	readonly facts: readonly DetectionFact[];
	readonly diagnostics: readonly Diagnostic[];
	readonly coverage: Readonly<Record<string, string | number>>;
};

export type DetectRequest = {
	readonly unit: AnalysisUnit;
	readonly openapi: OpenApiConfig;
	readonly detect: DetectConfig;
};

/**
 * Pure over the analysis unit: no filesystem, no clock, no environment. The
 * composition root materializes the unit and this use case never widens it.
 */
export class DetectFactsUseCase {
	constructor(
		private readonly reader: IOpenApiReader,
		private readonly parser: ISourceParser,
	) {}

	execute(request: DetectRequest): FactSet {
		const inventory = ingestServedContracts({
			unit: request.unit,
			serves: request.openapi.serves,
			reader: this.reader,
			schemaVersion: FACTS_SCHEMA_VERSION,
		});

		const routed = detectPythonDslRoutes({
			unit: request.unit,
			parser: this.parser,
			routers: request.detect.inbound.routers,
		});
		/*
		 * Stage three: the inventory and the code registrations are reconciled
		 * by semantic core rather than raced, so a route declared in both
		 * carries one fact with both provenances.
		 */
		const facts = finalizeEndpointFacts({
			drafts: [...inventory.drafts, ...routed],
			schemaVersion: FACTS_SCHEMA_VERSION,
			repositoryIdentity: request.unit.repositoryIdentity,
		});

		return {
			facts,
			diagnostics: inventory.diagnostics,
			coverage: coverageOf(request, facts.length),
		};
	}
}

/**
 * The inbound denominator is the declared inventory where one exists. Where no
 * specification is served there is nothing honest to divide by, so the value
 * is reported as unmeasured rather than as a completed fraction.
 */
function coverageOf(
	request: DetectRequest,
	inboundFacts: number,
): Readonly<Record<string, string | number>> {
	if (request.openapi.serves.length === 0) {
		return { inbound: "unmeasured", outbound: "unmeasured" };
	}
	return {
		inbound_declared: inboundFacts,
		inbound_handler_linked: 0,
		outbound: "unmeasured",
	};
}
