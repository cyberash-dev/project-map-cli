import type { Diagnostic } from "../../../core/domain/facts/diagnostic.js";
import type { DetectionFact } from "../../../core/domain/facts/fact.js";
import {
	containsUnknown,
	type ValueIr,
} from "../../../core/domain/facts/value-ir.js";

export type CrossCheckRequest = {
	readonly endpoints: readonly DetectionFact[];
	readonly hasInventory: boolean;
};

/**
 * Reconciles the two halves after the merge, which is the only point both are
 * present: a fact carrying one provenance is a route the other half did not
 * account for. A route whose path the analysis never proved raises neither,
 * because it cannot merge and its own reason already names why.
 */
export function crossCheckDiagnostics(
	request: CrossCheckRequest,
): readonly Diagnostic[] {
	const found: Diagnostic[] = [];
	for (const fact of request.endpoints) {
		const route = routeOf(fact);
		if (route === null) {
			continue;
		}
		const code = missingHalf(fact, request.hasInventory);
		if (code !== null) {
			found.push(diagnosticOf(code, route));
		}
	}
	return found;
}

function missingHalf(
	fact: DetectionFact,
	hasInventory: boolean,
): "openapi_route_not_in_code" | "router_route_not_in_openapi" | null {
	if (fact.provenance.length !== 1) {
		return null;
	}
	const [only] = fact.provenance;
	if (only === "openapi") {
		return "openapi_route_not_in_code";
	}
	return only === "router" && hasInventory
		? "router_route_not_in_openapi"
		: null;
}

function routeOf(fact: DetectionFact): string | null {
	if (fact.kind !== "endpoint") {
		return null;
	}
	const [variant] = fact.operation.variants;
	if (variant === undefined || !("http" in variant)) {
		return null;
	}
	const { method, path } = variant.http;
	if (containsUnknown(method) || containsUnknown(path)) {
		return null;
	}
	return `${literalOf(method)} ${literalOf(path)}`;
}

/** Both components are proven, so each is the literal the fold produced. */
function literalOf(value: ValueIr): string {
	return value.kind === "literal" ? value.value : "";
}

function diagnosticOf(code: Diagnostic["code"], route: string): Diagnostic {
	return {
		code,
		canonical_callee: route,
		canonical_call_shape: { arity: 0, receiver_type: null },
		evidence: [],
		count: 1,
	};
}
