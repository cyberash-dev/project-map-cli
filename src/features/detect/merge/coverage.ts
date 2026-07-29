import type {
	EndpointFact,
	OutboundOperationFact,
} from "../../../core/domain/facts/fact.js";
import { isDeferredToLinker } from "../outbound/library.js";

export type CoverageRequest = {
	readonly endpoints: readonly EndpointFact[];
	readonly operations: readonly OutboundOperationFact[];
	/** Whether a specification is served, and whether an outbound shape is declared. */
	readonly hasInventory: boolean;
	readonly hasOutboundShape: boolean;
};

export type Coverage = Readonly<Record<string, string | number>>;

/**
 * The honest denominators of project-map:BEH-013. An axis nothing declares is
 * reported unmeasured rather than as a completed fraction, and a half whose
 * operation lives outside the unit is counted apart from the sites this run
 * could have resolved.
 */
export function coverageOf(request: CoverageRequest): Coverage {
	return { ...inboundCoverage(request), ...outboundCoverage(request) };
}

function inboundCoverage(request: CoverageRequest): Coverage {
	if (!request.hasInventory) {
		return { inbound: "unmeasured" };
	}
	const declared = request.endpoints.filter((fact) =>
		fact.provenance.includes("openapi"),
	);
	return {
		inbound_declared: declared.length,
		inbound_registered_in_code: declared.filter((fact) =>
			fact.provenance.includes("router"),
		).length,
	};
}

function outboundCoverage(request: CoverageRequest): Coverage {
	if (!request.hasOutboundShape) {
		return { outbound: "unmeasured" };
	}
	const deferred = request.operations.filter(isDeferredToLinker);
	const local = request.operations.filter((fact) => !isDeferredToLinker(fact));
	return {
		outbound_classified: local.length,
		outbound_resolved: local.filter((fact) => fact.resolution === "resolved")
			.length,
		outbound_in_library: deferred.length,
	};
}
