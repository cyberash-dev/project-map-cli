import type { SourceAnchor } from "../../../core/domain/facts/anchor.js";
import type {
	Destination,
	DetectionFact,
	EndpointFact,
	HttpVariant,
	OperationVariant,
	OutboundOperationFact,
} from "../../../core/domain/facts/fact.js";
import { isEndpointFact } from "../../../core/domain/facts/fact.js";
import { containsUnknown } from "../../../core/domain/facts/value-ir.js";
import {
	orderByCanonicalBytes,
	orderEvidence,
} from "../canonical/array-order.js";

/**
 * The identity of a fact. Provenance, evidence, resolution, enrichment fields
 * and the destination binding are excluded, so enriching a fact never splits
 * it and merging never loses one.
 */
export function semanticCore(fact: DetectionFact): unknown {
	return isEndpointFact(fact) ? endpointCore(fact) : outboundCore(fact);
}

function endpointCore(fact: EndpointFact): unknown {
	const variant = onlyVariant(fact);
	const core = {
		mechanism: fact.mechanism,
		operation: identityVariant(variant),
	};
	if (!hasUnknownIdentity(variant)) {
		return core;
	}
	/*
	 * An unresolved registration has no distinguishing route, so two of them
	 * would otherwise merge on equal unknowns. The anchor keeps them apart.
	 */
	return { ...core, anchor: sourceAnchorOf(fact) };
}

function outboundCore(fact: OutboundOperationFact): unknown {
	return {
		mechanism: fact.mechanism,
		owner_operation: fact.owner_operation,
		variants: orderByCanonicalBytes(
			fact.operation.variants.map(identityVariant),
		),
		call_site: fact.call_site,
	};
}

function onlyVariant(fact: EndpointFact): OperationVariant {
	const [variant, ...rest] = fact.operation.variants;
	if (variant === undefined || rest.length > 0) {
		throw new Error(
			`endpoint fact must carry exactly one variant, got ${fact.operation.variants.length}`,
		);
	}
	return variant;
}

function identityVariant(variant: OperationVariant): unknown {
	if (!isHttpVariant(variant)) {
		return variant;
	}
	const { method, path, destination } = variant.http;
	if (destination === undefined) {
		return { http: { method, path } };
	}
	return {
		http: { method, path, destination: identityDestination(destination) },
	};
}

function identityDestination(destination: Destination): unknown {
	if (destination.kind === "unknown") {
		return destination;
	}
	return { kind: destination.kind, ref: destination.ref };
}

function hasUnknownIdentity(variant: OperationVariant): boolean {
	if (isHttpVariant(variant)) {
		return (
			containsUnknown(variant.http.method) || containsUnknown(variant.http.path)
		);
	}
	return containsUnknown(variant.queue.topic);
}

function sourceAnchorOf(fact: EndpointFact): SourceAnchor | null {
	const first = orderEvidence(fact.evidence)[0];
	if (first === undefined) {
		return null;
	}
	return {
		path: first.path,
		start_byte: first.start_byte,
		end_byte: first.end_byte,
	};
}

function isHttpVariant(variant: OperationVariant): variant is HttpVariant {
	return "http" in variant;
}
