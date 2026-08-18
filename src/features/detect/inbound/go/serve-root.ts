import type { ServeRoot } from "../../../../core/ports/config.port.js";
import type { SyntaxNode } from "../../../../infrastructure/parser/ts-utils.js";
import type { GoImportIndex } from "../../index/go/imports.js";
import type { GoPackageIndex } from "../../index/go/packages.js";

export type ResolvedServeRoot = {
	readonly declaration: SyntaxNode;
	readonly relPath: string;
	readonly directory: string;
	readonly imports: GoImportIndex;
	readonly result: number;
	readonly mount: string;
};

/**
 * Resolves a declared anchor to the one declaration it names. Zero matches and
 * several matches are both refusals: an anchor that named a set would compose
 * routes from whichever member the index happened to order first.
 */
export function resolveServeRoot(
	entry: ServeRoot,
	packages: GoPackageIndex,
): ResolvedServeRoot | null {
	const cut = entry.function.lastIndexOf(".");
	if (cut <= 0 || cut === entry.function.length - 1) {
		return null;
	}
	const matches = packages.matchesFor(entry.function.slice(0, cut));
	const [found, ...rest] = matches;
	if (found === undefined || rest.length > 0) {
		return null;
	}
	const name = entry.function.slice(cut + 1);
	const declaration = found.declarations.functionOf(name);
	const relPath = found.declarations.fileOf(`func:${name}`);
	if (
		declaration === null ||
		relPath === null ||
		!carriesResult(declaration, entry.result)
	) {
		return null;
	}
	return {
		declaration,
		relPath,
		directory: found.directory,
		imports: found.imports,
		result: entry.result,
		mount: entry.mount,
	};
}

/** Go returns a tuple; a bare type is a signature of arity one. */
function carriesResult(declaration: SyntaxNode, index: number): boolean {
	const result = declaration.childForFieldName("result");
	if (result === null) {
		return false;
	}
	const arity =
		result.type === "parameter_list" ? result.namedChildren.length : 1;
	return index < arity;
}

/** The operands a declaration returns, in the order its returns appear. */
export function returnOperands(
	declaration: SyntaxNode,
	index: number,
): readonly SyntaxNode[] {
	const body = declaration.childForFieldName("body");
	if (body === null) {
		return [];
	}
	const found: SyntaxNode[] = [];
	collectReturns(body, found);
	return found.flatMap((statement) => {
		const operand = statement.namedChildren[0];
		if (operand === undefined) {
			return [];
		}
		const list =
			operand.type === "expression_list" ? operand.namedChildren : [operand];
		const chosen = list.length === 1 && index === 0 ? list[0] : list[index];
		return chosen === undefined ? [] : [chosen];
	});
}

function collectReturns(node: SyntaxNode, into: SyntaxNode[]): void {
	if (node.type === "func_literal") {
		return;
	}
	if (node.type === "return_statement") {
		into.push(node);
		return;
	}
	for (const child of node.namedChildren) {
		collectReturns(child, into);
	}
}
