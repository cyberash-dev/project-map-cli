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
	for (const sink of sinks) {
		const claimed = ancestors.some(
			(ancestor) =>
				ancestor.origin !== null &&
				originMatches(sink.baseType, ancestor.origin),
		);
		if (claimed) {
			return sink;
		}
	}
	return null;
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
