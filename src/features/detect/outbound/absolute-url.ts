import type { Destination } from "../../../core/domain/facts/fact.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import { partsOf, templateOf } from "../value/template.js";

const ABSOLUTE = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*)(.*)$/s;

export type SplitUrl = {
	readonly destination: Destination | null;
	readonly path: ValueIr;
};

/**
 * A hard-coded absolute URL carries its own destination. Leaving the scheme and
 * authority in the path would run them through a grammar written for route
 * segments and would leave the destination unknown for a call that names it.
 */
export function splitAbsoluteUrl(url: ValueIr): SplitUrl {
	const parts = partsOf(url);
	const [head, ...rest] = parts;
	if (typeof head !== "string") {
		return { destination: null, path: url };
	}
	const match = ABSOLUTE.exec(head);
	if (match === null) {
		return { destination: null, path: url };
	}
	const [, origin = "", remainder = ""] = match;
	return {
		destination: {
			kind: "literal",
			ref: { kind: "literal", value: origin },
			binding: "instance",
		},
		path: templateOf([remainder, ...rest]),
	};
}
