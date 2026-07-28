import type { Evidence } from "../../../core/domain/facts/anchor.js";
import type { ContractRef } from "../../../core/domain/facts/fact.js";
import { jcs } from "./jcs.js";

/**
 * Set-valued arrays are ordered by their declared key before serialization.
 * Sequence-valued arrays, whose order carries meaning, are never routed here.
 */
export function orderEvidence(
	evidence: readonly Evidence[],
): readonly Evidence[] {
	return [...evidence].sort(
		(left, right) =>
			compare(left.path, right.path) ||
			left.start_byte - right.start_byte ||
			left.end_byte - right.end_byte ||
			compare(left.role, right.role),
	);
}

export function orderContractRefs(
	refs: readonly ContractRef[],
): readonly ContractRef[] {
	return [...refs].sort(
		(left, right) =>
			compare(left.contract_id, right.contract_id) ||
			compare(left.operation_id, right.operation_id),
	);
}

/**
 * Ordering for a set whose elements carry no declared key of their own. The
 * canonical bytes are a total order over structurally distinct elements.
 */
export function orderByCanonicalBytes<T>(values: readonly T[]): readonly T[] {
	const keyed = values.map((value) => ({ value, bytes: jcs(value) }));
	keyed.sort((left, right) => compare(left.bytes, right.bytes));
	return keyed.map((entry) => entry.value);
}

function compare(left: string, right: string): number {
	if (left === right) {
		return 0;
	}
	return left < right ? -1 : 1;
}
