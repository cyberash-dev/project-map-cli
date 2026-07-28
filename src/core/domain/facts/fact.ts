import type { Evidence, SourceAnchor, SymbolValue } from "./anchor.js";
import type { ValueIr } from "./value-ir.js";

export const MECHANISMS = ["http", "queue"] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export const PROVENANCES = [
	"openapi",
	"router",
	"generated",
	"transport",
	"declared",
] as const;
export type Provenance = (typeof PROVENANCES)[number];

export const RESOLUTIONS = [
	"resolved",
	"ambiguous",
	"unresolved",
	"conflicting",
] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const QUEUE_ACTIONS = ["consume", "produce"] as const;
export type QueueAction = (typeof QUEUE_ACTIONS)[number];

/** Which step of the target-binding ladder produced a destination. */
export const DESTINATION_BINDINGS = [
	"instance",
	"owner_construction",
	"owner_declaration",
] as const;
export type DestinationBinding = (typeof DESTINATION_BINDINGS)[number];

export type Destination =
	| { readonly kind: "unknown"; readonly reason: string }
	| {
			readonly kind: "config_ref" | "literal";
			readonly ref: ValueIr;
			readonly binding: DestinationBinding;
	  };

/**
 * One correlated tuple. Independent per-field alternatives are forbidden: a
 * branch that varies two fields together produces two variants.
 */
export type HttpVariant = {
	readonly http: {
		readonly method: ValueIr;
		readonly path: ValueIr;
		readonly destination?: Destination;
	};
};

export type QueueVariant = {
	readonly queue: {
		readonly action: QueueAction;
		readonly topic: ValueIr;
	};
};

export type OperationVariant = HttpVariant | QueueVariant;

export type Operation = {
	readonly variants: readonly OperationVariant[];
};

export type ContractRef = {
	readonly contract_id: string;
	readonly operation_id: string;
};

export type EndpointFact = {
	readonly id: string;
	readonly kind: "endpoint";
	readonly mechanism: Mechanism;
	readonly operation: Operation;
	readonly handler:
		| SymbolValue
		| { readonly kind: "unknown"; readonly reason: string };
	readonly contract_refs: readonly ContractRef[];
	readonly provenance: readonly Provenance[];
	readonly resolution: Resolution;
	readonly evidence: readonly Evidence[];
};

export type OutboundOperationFact = {
	readonly id: string;
	readonly kind: "outbound_operation";
	readonly mechanism: Mechanism;
	readonly operation: Operation;
	readonly owner_operation: string;
	readonly call_site: SourceAnchor;
	readonly module_id: string | null;
	readonly callee_operation:
		| SymbolValue
		| { readonly kind: "unknown"; readonly reason: string }
		| null;
	readonly contract_ref: ContractRef | null;
	readonly provenance: readonly Provenance[];
	readonly resolution: Resolution;
	readonly evidence: readonly Evidence[];
};

export type DetectionFact = EndpointFact | OutboundOperationFact;

export function isEndpointFact(fact: DetectionFact): fact is EndpointFact {
	return fact.kind === "endpoint";
}
