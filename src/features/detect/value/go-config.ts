import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";

export type TypeResolver = (name: string, scope: SyntaxNode) => string | null;

/**
 * A dotted read rooted at a name whose declared type resolves is a
 * configuration locator, never its value. Resolving a key to a per-environment
 * value is the linker's work, so the locator names the declaration and the
 * path, and nothing else.
 */
export function foldGoConfigRef(
	node: SyntaxNode,
	scope: SyntaxNode,
	typeOf: TypeResolver,
): ValueIr | null {
	const target = node.type === "unary_expression" ? dereferenced(node) : node;
	if (target === null || target.type !== "selector_expression") {
		return null;
	}
	const segments = dottedSegments(target);
	const [root, ...rest] = segments;
	if (root === undefined || rest.length === 0) {
		return null;
	}
	const declaration = typeOf(root, scope);
	if (declaration === null) {
		return null;
	}
	return {
		kind: "config_ref",
		ref: { declaration, path_segments: rest },
	};
}

/** `&cfg.Debts` addresses the same field `cfg.Debts` names. */
function dereferenced(node: SyntaxNode): SyntaxNode | null {
	const operator = node.childForFieldName("operator");
	if (operator === null || operator.text !== "&") {
		return null;
	}
	return node.childForFieldName("operand");
}

function dottedSegments(node: SyntaxNode): readonly string[] {
	if (node.type === "identifier") {
		return [node.text];
	}
	if (node.type !== "selector_expression") {
		return [];
	}
	const operand = node.childForFieldName("operand");
	const field = node.childForFieldName("field");
	if (operand === null || field === null) {
		return [];
	}
	const prefix = dottedSegments(operand);
	return prefix.length === 0 ? [] : [...prefix, field.text];
}
