import type {
	CallShape,
	Diagnostic,
	DiagnosticCode,
} from "../../../core/domain/facts/diagnostic.js";
import { MANDATORY_CHECK_CODES } from "../../../core/domain/facts/diagnostic.js";
import { orderByCanonicalBytes } from "../canonical/array-order.js";
import { jcs } from "../canonical/jcs.js";

/** The core of a diagnostic, which is all a baseline entry carries. */
export type BaselineEntry = {
	readonly code: DiagnosticCode;
	readonly canonical_callee: string;
	readonly canonical_call_shape: CallShape;
};

export type RatchetVerdict = {
	/** Cores the run emitted that the baseline does not list. */
	readonly unlisted: readonly BaselineEntry[];
	/** Entries that suppress nothing, including any naming a mandatory code. */
	readonly stale: readonly BaselineEntry[];
};

/**
 * The ratchet of project-map:BEH-014. A mandatory check diagnostic is outside
 * it in both directions: the baseline cannot suppress one, and listing one is
 * how an entry goes stale.
 */
export function ratchet(
	diagnostics: readonly Diagnostic[],
	baseline: readonly BaselineEntry[],
): RatchetVerdict {
	const emitted = new Map<string, BaselineEntry>();
	for (const diagnostic of diagnostics) {
		if (MANDATORY_CHECK_CODES.has(diagnostic.code)) {
			continue;
		}
		emitted.set(keyOf(diagnostic), coreOf(diagnostic));
	}
	const listed = new Set(baseline.map(keyOf));
	const unlisted = [...emitted.entries()]
		.filter(([key]) => !listed.has(key))
		.map(([, entry]) => entry);
	const stale = baseline.filter(
		(entry) =>
			MANDATORY_CHECK_CODES.has(entry.code) || !emitted.has(keyOf(entry)),
	);
	return {
		unlisted: orderByCanonicalBytes(unlisted),
		stale: orderByCanonicalBytes(stale),
	};
}

export function isRatchetClean(verdict: RatchetVerdict): boolean {
	return verdict.unlisted.length === 0 && verdict.stale.length === 0;
}

function keyOf(entry: BaselineEntry | Diagnostic): string {
	return jcs([entry.code, entry.canonical_callee, entry.canonical_call_shape]);
}

function coreOf(diagnostic: Diagnostic): BaselineEntry {
	return {
		code: diagnostic.code,
		canonical_callee: diagnostic.canonical_callee,
		canonical_call_shape: diagnostic.canonical_call_shape,
	};
}
