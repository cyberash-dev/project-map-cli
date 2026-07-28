import type {
	HttpVariant,
	Operation,
	OperationVariant,
	Resolution,
} from "../../../core/domain/facts/fact.js";
import { containsUnknown } from "../../../core/domain/facts/value-ir.js";
import { orderByCanonicalBytes } from "../canonical/array-order.js";

export type ResolutionRequest = {
	readonly operation: Operation;
	readonly requiresDestination: boolean;
};

/**
 * The ladder of project-map:CTR-006, evaluated in order. `conflicting` is a
 * property of a merge and is therefore set by the merger, never derived from
 * one value's IR kind.
 */
export function deriveResolution(request: ResolutionRequest): Resolution {
	const { variants } = request.operation;
	if (variants.some((variant) => hasUnknownRequired(variant, request))) {
		return "unresolved";
	}
	return distinctVariantCount(variants) > 1 ? "ambiguous" : "resolved";
}

function hasUnknownRequired(
	variant: OperationVariant,
	request: ResolutionRequest,
): boolean {
	if (!isHttpVariant(variant)) {
		return containsUnknown(variant.queue.topic);
	}
	const { method, path, destination } = variant.http;
	if (containsUnknown(method) || containsUnknown(path)) {
		return true;
	}
	if (!request.requiresDestination) {
		return false;
	}
	return destination === undefined || destination.kind === "unknown";
}

function distinctVariantCount(variants: readonly OperationVariant[]): number {
	return new Set(
		orderByCanonicalBytes(variants).map((variant) => JSON.stringify(variant)),
	).size;
}

function isHttpVariant(variant: OperationVariant): variant is HttpVariant {
	return "http" in variant;
}
