import type { Diagnostic } from "../../core/domain/facts/diagnostic.js";
import type { DetectionFact } from "../../core/domain/facts/fact.js";
import type { AnalysisUnit } from "../../core/ports/analysis-unit.port.js";
import type { OpenApiConfig } from "../../core/ports/config.port.js";
import type { IOpenApiReader } from "../../core/ports/openapi.port.js";
import type { ISourceParser } from "../../core/ports/parser.port.js";
import type { DetectConfig } from "../../core/ports/config.port.js";
import { detectGoRouterRoutes } from "./inbound/go/chi.js";
import { detectPythonDslRoutes } from "./inbound/python-dsl.js";
import {
	finalizeEndpointFacts,
	finalizeOutboundFacts,
} from "./merge/merge-table.js";
import { ingestServedContracts } from "./openapi/ingest.js";
import { detectGoOutbound } from "./outbound/go.js";
import { detectPythonOutbound } from "./outbound/python.js";
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

		const inbound = {
			unit: request.unit,
			parser: this.parser,
			routers: request.detect.inbound.routers,
		};
		const routed = [
			...detectPythonDslRoutes(inbound),
			...detectGoRouterRoutes(inbound),
		];
		/*
		 * Stage three: the inventory and the code registrations are reconciled
		 * by semantic core rather than raced, so a route declared in both
		 * carries one fact with both provenances.
		 */
		const endpoints = finalizeEndpointFacts({
			drafts: [...inventory.drafts, ...routed],
			schemaVersion: FACTS_SCHEMA_VERSION,
			repositoryIdentity: request.unit.repositoryIdentity,
		});

		const outbound = detectPythonOutbound({
			unit: request.unit,
			parser: this.parser,
			sinks: request.detect.outbound.sinks,
			consumes: request.openapi.consumes,
		});
		const goOutbound = detectGoOutbound({
			unit: request.unit,
			parser: this.parser,
			sinks: request.detect.outbound.sinks,
		});
		const operations = finalizeOutboundFacts({
			drafts: [...outbound.facts, ...goOutbound.facts],
			schemaVersion: FACTS_SCHEMA_VERSION,
			repositoryIdentity: request.unit.repositoryIdentity,
		});

		return {
			facts: [...endpoints, ...operations],
			diagnostics: [
				...inventory.diagnostics,
				...outbound.diagnostics,
				...goOutbound.diagnostics,
			],
			coverage: coverageOf(request, endpoints.length, operations.length),
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
	outboundFacts: number,
): Readonly<Record<string, string | number>> {
	const outbound =
		request.detect.outbound.sinks.length === 0 &&
		request.openapi.consumes.length === 0
			? { outbound: "unmeasured" }
			: { outbound_classified: outboundFacts };
	if (request.openapi.serves.length === 0) {
		return { inbound: "unmeasured", ...outbound };
	}
	return {
		inbound_declared: inboundFacts,
		inbound_handler_linked: 0,
		...outbound,
	};
}
