import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	findAll,
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";

export type GoTypeDeclaration = {
	readonly name: string;
	/** Types embedded without a field name, which is how Go composes behavior. */
	readonly embedded: readonly string[];
};

export type GoDeclarationIndex = {
	constOf(name: string): SyntaxNode | null;
	typeOf(name: string): GoTypeDeclaration | null;
	/** The declared result type of a package-level function, unqualified. */
	resultOf(name: string): string | null;
	/** The declaration of a package-level function, for a constructor summary. */
	functionOf(name: string): SyntaxNode | null;
};

export function goDeclarationIndex(
	files: readonly ParsedFile[],
): GoDeclarationIndex {
	const constants = new Map<string, SyntaxNode>();
	const types = new Map<string, GoTypeDeclaration>();
	const results = new Map<string, string>();
	const functions = new Map<string, SyntaxNode>();
	for (const file of files) {
		const root = rootOf(file.tree);
		readSpecs(root, "const_spec", constants);
		readSpecs(root, "var_spec", constants);
		readTypes(root, types);
		readFunctions(root, results, functions);
	}
	return {
		constOf: (name) => constants.get(name) ?? null,
		typeOf: (name) => types.get(name) ?? null,
		resultOf: (name) => results.get(name) ?? null,
		functionOf: (name) => functions.get(name) ?? null,
	};
}

function readSpecs(
	root: SyntaxNode,
	type: string,
	into: Map<string, SyntaxNode>,
): void {
	for (const spec of findAll(root, (node) => node.type === type)) {
		const name = spec.childForFieldName("name");
		const value = spec.childForFieldName("value")?.namedChildren[0];
		if (name !== null && value !== undefined) {
			into.set(name.text, value);
		}
	}
}

function readTypes(
	root: SyntaxNode,
	into: Map<string, GoTypeDeclaration>,
): void {
	for (const spec of findAll(root, (node) => node.type === "type_spec")) {
		const name = spec.childForFieldName("name");
		const body = spec.childForFieldName("type");
		if (name === null || body === null) {
			continue;
		}
		into.set(name.text, { name: name.text, embedded: embeddedOf(body) });
	}
}

/**
 * An embedded member is a field or a method spec that carries a type and no
 * name of its own. Reading only named fields would miss every composition.
 */
function embeddedOf(body: SyntaxNode): readonly string[] {
	const found: string[] = [];
	for (const field of findAll(
		body,
		(node) => node.type === "field_declaration" || node.type === "method_elem",
	)) {
		if (field.childForFieldName("name") !== null) {
			continue;
		}
		const type = field.childForFieldName("type") ?? field.namedChildren[0];
		if (type !== undefined && type !== null) {
			found.push(unpointer(type.text));
		}
	}
	return found;
}

function unpointer(text: string): string {
	return text.startsWith("*") ? text.slice(1) : text;
}

function readFunctions(
	root: SyntaxNode,
	results: Map<string, string>,
	functions: Map<string, SyntaxNode>,
): void {
	for (const declaration of root.namedChildren) {
		if (declaration.type !== "function_declaration") {
			continue;
		}
		const name = declaration.childForFieldName("name");
		const result = declaration.childForFieldName("result");
		if (name === null) {
			continue;
		}
		functions.set(name.text, declaration);
		if (result !== null) {
			results.set(name.text, unpointer(firstResultType(result)));
		}
	}
}

/**
 * Go returns a tuple; the value a factory hands back is the first member, and
 * the rest is the error convention.
 */
function firstResultType(result: SyntaxNode): string {
	if (result.type !== "parameter_list") {
		return result.text;
	}
	const first = result.namedChildren[0];
	if (first === undefined) {
		return "";
	}
	return first.childForFieldName("type")?.text ?? first.text;
}
