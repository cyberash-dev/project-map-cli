import type { ValueIr } from "../../../../core/domain/facts/value-ir.js";

/** The origin whose multiplexer carries the method inside its pattern. */
export const MUX_ORIGIN = "net/http";

export const MUX_MEMBERS = new Set(["Handle", "HandleFunc"]);

const DYNAMIC: ValueIr = { kind: "unknown", reason: "dynamic" };

const METHOD = /^[A-Z]+$/;

export type MuxPattern = {
	/** One entry per emitted fact: GET answers HEAD as well. */
	readonly methods: readonly ValueIr[];
	readonly path: ValueIr;
};

/**
 * The `[METHOD ][HOST]/[PATH]` grammar the multiplexer itself fixes. A pattern
 * naming no method leaves the method typed rather than expanding into a verb
 * set the source never wrote, and a pattern naming a host types the path,
 * because the route such a pattern names is not the path alone.
 */
export function muxPattern(folded: ValueIr): MuxPattern {
	if (folded.kind !== "literal") {
		return { methods: [DYNAMIC], path: folded };
	}
	const cut = folded.value.indexOf(" ");
	if (cut < 0) {
		return { methods: [DYNAMIC], path: pathOf(folded.value) };
	}
	const head = folded.value.slice(0, cut);
	const rest = folded.value.slice(cut + 1);
	return METHOD.test(head)
		? { methods: methodsOf(head), path: pathOf(rest) }
		: { methods: [DYNAMIC], path: DYNAMIC };
}

/** The multiplexer answers HEAD wherever it answers GET. */
function methodsOf(method: string): readonly ValueIr[] {
	const named: ValueIr = { kind: "literal", value: method };
	return method === "GET"
		? [named, { kind: "literal", value: "HEAD" }]
		: [named];
}

function pathOf(rest: string): ValueIr {
	return rest.startsWith("/") ? { kind: "literal", value: rest } : DYNAMIC;
}
