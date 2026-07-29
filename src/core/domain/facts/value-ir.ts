export const REASON_CODES = [
	"dynamic",
	"recursive",
	"correlation_lost",
	"depth_exceeded",
	"alias_mutation",
	"cross_boundary",
	"open_world_dispatch",
	"loop_carried",
	"non_finite_branch",
	"operation_in_library",
	"operation_in_library_root",
	"operation_mapping_unresolved",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** Canonical spelling of a positional path parameter in a canonical path. */
export const POSITIONAL_HOLE = "{}";

/** Canonical spelling of a wildcard segment in a canonical path. */
export const WILDCARD_HOLE = "{*}";

export type LiteralIr = {
	readonly kind: "literal";
	readonly value: string;
};

/**
 * A locator for a configuration key, never its value. The environment axis
 * stays outside the locator: resolving a key to a per-environment value is
 * the linker's work.
 */
export type ConfigRefIr = {
	readonly kind: "config_ref";
	readonly ref: {
		readonly declaration: string;
		readonly path_segments: readonly string[];
	};
};

export type ParameterIr = {
	readonly kind: "parameter";
	readonly owner_symbol: string;
	readonly index: number;
};

export type TemplateIr = {
	readonly kind: "template";
	readonly parts: readonly TemplatePart[];
};

export type ChoiceIr = {
	readonly kind: "choice";
	readonly alternatives: readonly ValueIr[];
};

export type UnknownIr = {
	readonly kind: "unknown";
	readonly reason: ReasonCode;
};

export type ValueIr =
	| LiteralIr
	| ConfigRefIr
	| ParameterIr
	| TemplateIr
	| ChoiceIr
	| UnknownIr;

/**
 * A template part is either a rendered segment, which covers both a literal
 * run and a canonical hole spelling, or a typed value that stayed unresolved.
 */
export type TemplatePart = string | ValueIr;

export function isLiteralIr(value: ValueIr): value is LiteralIr {
	return value.kind === "literal";
}

export function isUnknownIr(value: ValueIr): value is UnknownIr {
	return value.kind === "unknown";
}

export function isTemplateIr(value: ValueIr): value is TemplateIr {
	return value.kind === "template";
}

/**
 * Whether any part of a value stayed unproven. A canonical template and a
 * parameter hole are themselves resolved, so only a nested `unknown` counts.
 */
/**
 * Every reason a value stayed unproven, holes nested in a template or a choice
 * included. A caller that has to tell one class of hole from another needs all
 * of them, not only the one the outermost value carries.
 */
export function reasonsOf(value: ValueIr): readonly ReasonCode[] {
	if (value.kind === "unknown") {
		return [value.reason];
	}
	if (value.kind === "template") {
		return value.parts.flatMap((part) =>
			typeof part === "string" ? [] : reasonsOf(part),
		);
	}
	return value.kind === "choice" ? value.alternatives.flatMap(reasonsOf) : [];
}

export function containsUnknown(value: ValueIr): boolean {
	if (value.kind === "unknown") {
		return true;
	}
	if (value.kind === "template") {
		return value.parts.some(
			(part) => typeof part !== "string" && containsUnknown(part),
		);
	}
	if (value.kind === "choice") {
		return value.alternatives.some(containsUnknown);
	}
	return false;
}
