import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";
import { findAll } from "../../../infrastructure/parser/ts-utils.js";

export type CallSite = {
	readonly call: SyntaxNode;
	readonly member: string | null;
	readonly receiver: SyntaxNode | null;
	/** Dotted spelling of the callee, for a diagnostic core. */
	readonly calleeText: string;
	readonly ownerOperation: string;
};

/**
 * Every call inside a declaration body, tagged with the operation that owns it.
 * The owner is the qualified name a linker reads, not a display label.
 */
export function callSitesOf(root: SyntaxNode): readonly CallSite[] {
	const sites: CallSite[] = [];
	for (const definition of findAll(
		root,
		(node) => node.type === "function_definition",
	)) {
		const owner = qualifiedName(definition);
		const body = definition.childForFieldName("body");
		if (body === null) {
			continue;
		}
		for (const call of findAll(body, (node) => node.type === "call")) {
			sites.push(siteOf(call, owner));
		}
	}
	return sites;
}

function siteOf(call: SyntaxNode, ownerOperation: string): CallSite {
	const callee = call.childForFieldName("function");
	if (callee === null || callee.type !== "attribute") {
		return {
			call,
			member: null,
			receiver: null,
			calleeText: callee?.text ?? "",
			ownerOperation,
		};
	}
	const attribute = callee.childForFieldName("attribute");
	return {
		call,
		member: attribute?.text ?? null,
		receiver: callee.childForFieldName("object"),
		calleeText: callee.text,
		ownerOperation,
	};
}

/**
 * The enclosing class joined to the member, so two clients declaring the same
 * member name are two owners rather than one.
 */
function qualifiedName(definition: SyntaxNode): string {
	const name = definition.childForFieldName("name")?.text ?? "";
	const owner = enclosingClassName(definition);
	return owner === null ? name : `${owner}.${name}`;
}

function enclosingClassName(node: SyntaxNode): string | null {
	let cursor = node.parent ?? null;
	while (cursor !== null && cursor !== undefined) {
		if (cursor.type === "class_definition") {
			return cursor.childForFieldName("name")?.text ?? null;
		}
		cursor = cursor.parent ?? null;
	}
	return null;
}

/** The class a definition sits in, for the ancestry walk. */
export function classOfDefinition(node: SyntaxNode): string | null {
	return enclosingClassName(node);
}
