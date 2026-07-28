import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";
import { concatValues } from "./template.js";

const STRING_LITERALS = new Set([
	"interpreted_string_literal",
	"raw_string_literal",
]);

/**
 * Folds a Go expression to the value IR of project-map:CTR-007. Only the forms
 * this phase can prove are folded; anything else becomes a typed hole rather
 * than the text of the expression that produced it.
 */
export function foldGoValue(node: SyntaxNode | null): ValueIr {
	if (node === null) {
		return { kind: "unknown", reason: "dynamic" };
	}
	if (STRING_LITERALS.has(node.type)) {
		return { kind: "literal", value: literalContent(node) };
	}
	if (node.type === "parenthesized_expression") {
		return foldGoValue(node.namedChildren[0] ?? null);
	}
	if (node.type !== "binary_expression") {
		return { kind: "unknown", reason: "dynamic" };
	}
	return foldConcatenation(node);
}

function literalContent(node: SyntaxNode): string {
	const content = node.namedChildren[0];
	return content === undefined ? "" : content.text;
}

function foldConcatenation(node: SyntaxNode): ValueIr {
	const operator = node.childForFieldName("operator");
	if (operator === null || operator.text !== "+") {
		return { kind: "unknown", reason: "dynamic" };
	}
	return concatValues(
		foldGoValue(node.childForFieldName("left")),
		foldGoValue(node.childForFieldName("right")),
	);
}
