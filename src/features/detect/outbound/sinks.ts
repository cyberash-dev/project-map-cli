import type {
	DeclaredSink,
	Selector,
	SinkCall,
} from "../../../core/ports/config.port.js";
import type { Ancestor } from "../index/python/hierarchy.js";
import { originMatches } from "../index/module-resolver.js";

export type SinkMatch = {
	readonly sink: DeclaredSink;
	readonly call: SinkCall;
};

/**
 * The sink a class belongs to. A class claims a sink only when an ancestor's
 * import origin resolves to the declared base type, so a class that merely
 * carries the members claims nothing.
 */
export function sinkOfAncestry(
	ancestors: readonly Ancestor[],
	sinks: readonly DeclaredSink[],
): DeclaredSink | null {
	return sinkBoundaryOf(ancestors, sinks)?.sink ?? null;
}

/** The sink a class belongs to, with the ancestor that declares the boundary. */
export function sinkBoundaryOf(
	ancestors: readonly Ancestor[],
	sinks: readonly DeclaredSink[],
): { readonly sink: DeclaredSink; readonly index: number } | null {
	for (const sink of sinks) {
		const index = ancestors.findIndex(
			(ancestor) =>
				ancestor.origin !== null &&
				originMatches(sink.baseType, ancestor.origin),
		);
		if (index >= 0) {
			return { sink, index };
		}
	}
	return null;
}

/**
 * Whether calling `member` on an instance of this hierarchy leaves it. A member
 * an ancestor below the boundary declares is the subclass's own business; one
 * declared at the boundary or above it, or nowhere the unit can see, can only
 * have come from the declared base type.
 */
export function crossesSinkBoundary(
	ancestors: readonly Ancestor[],
	sinks: readonly DeclaredSink[],
	member: string,
): boolean {
	const boundary = sinkBoundaryOf(ancestors, sinks);
	if (boundary === null) {
		return false;
	}
	const declaredAt = ancestors.findIndex((ancestor) =>
		ancestor.declared?.methods.has(member),
	);
	return declaredAt < 0 || declaredAt >= boundary.index;
}

export function callOfMember(
	sink: DeclaredSink,
	member: string,
): SinkCall | null {
	return sink.call.find((entry) => entry.member === member) ?? null;
}

/** A per-member binding overrides the sink-level one for that member alone. */
export function bindingOf(
	match: SinkMatch,
	key: "pathArg" | "method" | "target",
): Selector | null {
	return match.call[key] ?? match.sink[key];
}
