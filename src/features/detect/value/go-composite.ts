import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";

function unwrapElement(node: SyntaxNode | null): SyntaxNode | null {
	if (node === null || node.type !== "literal_element") {
		return node;
	}
	return node.namedChildren[0] ?? null;
}

/** The named fields a composite literal assigns, by field name. */
export function keyedFieldsOf(literal: SyntaxNode): Map<string, SyntaxNode> {
	const fields = new Map<string, SyntaxNode>();
	const body = literal.childForFieldName("body");
	for (const element of body?.namedChildren ?? []) {
		if (element.type !== "keyed_element") {
			continue;
		}
		const key = element.childForFieldName("key");
		const value = unwrapElement(element.childForFieldName("value"));
		if (key !== null && value !== null) {
			fields.set(key.text, value);
		}
	}
	return fields;
}
