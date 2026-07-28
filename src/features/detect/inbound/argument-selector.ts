import type { Selector } from "../../../core/ports/config.port.js";
import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";

/**
 * Resolves a selector against a call's arguments. Only the leading `arg` step
 * is meaningful for a registration argument; a longer chain reaches into a
 * value the normalizer has to fold first, which no inbound adapter needs yet
 * and which is therefore refused rather than half-applied.
 */
export function argumentFor(
	selector: Selector,
	positional: readonly SyntaxNode[],
	keywords: ReadonlyMap<string, SyntaxNode>,
): SyntaxNode | null {
	if (selector.length !== 1) {
		return null;
	}
	const step = selector[0];
	if (step === undefined || step.kind !== "arg") {
		return null;
	}
	if (typeof step.selector === "number") {
		return positional[step.selector] ?? null;
	}
	return keywords.get(step.selector) ?? null;
}

export function keywordArguments(
	args: SyntaxNode,
): ReadonlyMap<string, SyntaxNode> {
	const byName = new Map<string, SyntaxNode>();
	for (const node of args.namedChildren) {
		if (node.type !== "keyword_argument") {
			continue;
		}
		const name = node.childForFieldName("name");
		const value = node.childForFieldName("value");
		if (name !== null && value !== null) {
			byName.set(name.text, value);
		}
	}
	return byName;
}
