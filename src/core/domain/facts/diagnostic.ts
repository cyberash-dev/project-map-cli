import type { Evidence } from "./anchor.js";

export const DIAGNOSTIC_CODES = [
	"external_call_unclassified",
	"external_registration_unclassified",
	"recognized_sink_field_unresolved",
	"dynamic_target",
	"marker_invalid",
	"selector_unresolved",
	"openapi_spec_unreadable",
	"openapi_route_not_in_code",
	"generated_operation_unresolved",
	"router_mount_unresolved",
	"unanchored_router",
	"serve_root_unresolved",
	"router_route_not_in_openapi",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

/** Codes that fail check mode independently of the committed bytes. */
export const MANDATORY_CHECK_CODES: ReadonlySet<DiagnosticCode> = new Set([
	"selector_unresolved",
	"marker_invalid",
	"serve_root_unresolved",
]);

/** Arity and the proven receiver type: what makes two call sites one shape. */
export type CallShape = {
	readonly arity: number;
	readonly receiver_type: string | null;
};

export type Diagnostic = {
	readonly code: DiagnosticCode;
	readonly canonical_callee: string;
	readonly canonical_call_shape: CallShape;
	readonly evidence: readonly Evidence[];
	readonly count: number;
};
