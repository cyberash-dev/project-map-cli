import type {
	Evidence,
	SourceAnchor,
} from "../../../core/domain/facts/anchor.js";
import type {
	CallShape,
	Diagnostic,
	DiagnosticCode,
} from "../../../core/domain/facts/diagnostic.js";
import { orderEvidence } from "../canonical/array-order.js";
import { jcs } from "../canonical/jcs.js";

/** One site inside the candidate universe that no classification tier claimed. */
export type DiagnosticSite = {
	readonly code: DiagnosticCode;
	readonly canonicalCallee: string;
	readonly shape: CallShape;
	readonly anchor: SourceAnchor;
};

/**
 * Merges by the core of project-map:BEH-013, (code, canonical_callee,
 * canonical_call_shape). `count` is the number of DISTINCT source anchors, so
 * one callee reached from three sites is one diagnostic with count three and
 * never a tally of how often the walk passed through it.
 */
export function mergeDiagnostics(
	sites: readonly DiagnosticSite[],
): readonly Diagnostic[] {
	const byCore = new Map<string, DiagnosticSite[]>();
	for (const site of sites) {
		const key = coreKey(site);
		byCore.set(key, [...(byCore.get(key) ?? []), site]);
	}
	return [...byCore.values()].map(diagnosticOf).sort(byCoreOrder);
}

function coreKey(site: DiagnosticSite): string {
	return jcs([site.code, site.canonicalCallee, site.shape]);
}

function diagnosticOf(group: readonly DiagnosticSite[]): Diagnostic {
	const [head] = group;
	if (head === undefined) {
		throw new Error("diagnostic group must carry at least one site");
	}
	const evidence: Evidence[] = group.map((site) => ({
		...site.anchor,
		role: "call",
	}));
	const distinct = orderEvidence([
		...new Map(evidence.map((entry) => [jcs(entry), entry])).values(),
	]);
	return {
		code: head.code,
		canonical_callee: head.canonicalCallee,
		canonical_call_shape: head.shape,
		evidence: distinct,
		count: distinct.length,
	};
}

function byCoreOrder(left: Diagnostic, right: Diagnostic): number {
	const ordered = [left, right].map((entry) =>
		jcs([
			entry.code,
			entry.canonical_callee,
			entry.canonical_call_shape.arity,
			entry.canonical_call_shape.receiver_type ?? "",
		]),
	);
	const [first, second] = ordered;
	if (first === undefined || second === undefined) {
		return 0;
	}
	return first < second ? -1 : first > second ? 1 : 0;
}
