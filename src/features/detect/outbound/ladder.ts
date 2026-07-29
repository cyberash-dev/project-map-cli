import type { SourceAnchor } from "../../../core/domain/facts/anchor.js";
import type {
	Destination,
	OutboundOperationFact,
	Provenance,
} from "../../../core/domain/facts/fact.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import { deriveResolution } from "../merge/resolution.js";

export type DraftOutboundFact = Omit<OutboundOperationFact, "id">;

/** The join key of a shared-library half; both members are null without one. */
export type JoinKey = {
	readonly moduleId: string;
	readonly calleeOperation: OutboundOperationFact["callee_operation"];
};

export type OperationDraft = {
	readonly provenance: Provenance;
	readonly method: ValueIr;
	readonly path: ValueIr;
	readonly destinations: readonly Destination[];
	readonly ownerOperation: string;
	readonly anchor: SourceAnchor;
	readonly join?: JoinKey | null;
};

/**
 * Assembles one outbound fact per claimed site. A site is emitted even when
 * extraction left fields unresolved, because project-map:INV-005 forbids
 * dropping a claimed site and forbids falling through to a lower tier.
 */
export function outboundDraft(draft: OperationDraft): DraftOutboundFact {
	const operation = {
		variants: draft.destinations.map((destination) => ({
			http: { method: draft.method, path: draft.path, destination },
		})),
	};
	return {
		kind: "outbound_operation",
		mechanism: "http",
		operation,
		owner_operation: draft.ownerOperation,
		call_site: draft.anchor,
		module_id: draft.join?.moduleId ?? null,
		callee_operation: draft.join?.calleeOperation ?? null,
		contract_ref: null,
		provenance: [draft.provenance],
		resolution: deriveResolution({ operation, requiresDestination: true }),
		evidence: [{ ...draft.anchor, role: "call" }],
	};
}
