import * as path from "node:path";
import { isMap, isPair, isScalar, parseDocument } from "yaml";

const KEY = "min_tool_version";
const REWRITABLE = new Set([".yaml", ".yml", ".json"]);

export type FloorSpan = { readonly start: number; readonly end: number };

export type FloorLocation =
	| { readonly kind: "found"; readonly span: FloorSpan }
	| { readonly kind: "absent" }
	| { readonly kind: "refused"; readonly reason: string };

export function isRewritable(sourcePath: string): boolean {
	return REWRITABLE.has(path.extname(sourcePath));
}

/**
 * Locates the floor value as a byte span so the caller can splice it. Nothing
 * outside the span is re-emitted: a serializer round-trip would preserve the
 * comment a blocked reader needs and still refold every other line
 * (project-map:DLT-028).
 */
export function locateFloor(text: string): FloorLocation {
	const contents = parseDocument(text).contents;
	if (!isMap(contents)) {
		return { kind: "refused", reason: "the document is not a mapping" };
	}
	const pairs = contents.items.filter(
		(item) => isPair(item) && isScalar(item.key) && item.key.value === KEY,
	);
	if (pairs.length === 0) {
		return { kind: "absent" };
	}
	if (pairs.length > 1) {
		return { kind: "refused", reason: `${KEY} is declared more than once` };
	}
	return spanOf(pairs[0]);
}

function spanOf(pair: unknown): FloorLocation {
	if (!isPair(pair)) {
		return { kind: "refused", reason: `${KEY} is not a key` };
	}
	const value = pair.value;
	if (!isScalar(value)) {
		return { kind: "refused", reason: `${KEY} is not a plain scalar` };
	}
	const range = value.range;
	if (!range) {
		return { kind: "refused", reason: `${KEY} carries no source range` };
	}
	if (value.anchor !== undefined) {
		return { kind: "refused", reason: `${KEY} carries an anchor` };
	}
	if (value.type === "BLOCK_FOLDED" || value.type === "BLOCK_LITERAL") {
		return { kind: "refused", reason: `${KEY} is a block scalar` };
	}
	return { kind: "found", span: { start: range[0], end: range[1] } };
}

export function withFloorRaised(
	text: string,
	span: FloorSpan,
	release: string,
): string {
	return (
		text.slice(0, span.start) + JSON.stringify(release) + text.slice(span.end)
	);
}
