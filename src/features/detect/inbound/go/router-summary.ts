import type { SyntaxNode } from "../../../../infrastructure/parser/ts-utils.js";
import type { GoImportIndex } from "../../index/go/imports.js";
import type { GoPackageIndex } from "../../index/go/packages.js";
import type { RouterRecord, FieldValue } from "./router-record.js";
import type { RouterValue } from "./router-scope.js";

export type CalleeDeclaration = {
	readonly declaration: SyntaxNode;
	readonly relPath: string;
	readonly directory: string;
	readonly imports: GoImportIndex;
};

export type CalleeLookup = {
	readonly imports: GoImportIndex;
	readonly directory: string;
	readonly packages: GoPackageIndex;
	/** The declaration the call sits in, for reading a receiver's type. */
	readonly scope: SyntaxNode;
};

export type GoParameter = {
	readonly name: string;
	readonly type: string;
};

/**
 * Positional parameters in declaration order. Go lets one declaration name
 * several parameters of one type, and each of them is its own position.
 */
export function parametersOf(declaration: SyntaxNode): readonly GoParameter[] {
	const list = declaration.childForFieldName("parameters");
	const found: GoParameter[] = [];
	for (const entry of list?.namedChildren ?? []) {
		if (entry.type !== "parameter_declaration") {
			continue;
		}
		const type = entry.childForFieldName("type")?.text ?? "";
		const names = entry.namedChildren.filter(
			(child) => child.type === "identifier",
		);
		for (const name of names) {
			found.push({ name: name.text, type });
		}
	}
	return found;
}

/** A stable key for the router values and records a call seeds a body with. */
export function seedSignature(
	seeds: readonly {
		readonly index: number;
		readonly value: RouterValue | null;
		readonly record: RouterRecord | null;
	}[],
): string {
	return seeds
		.map(
			(seed) =>
				`${seed.index}:${identityKey(seed.value)}:${recordKey(seed.record)}`,
		)
		.join("|");
}

function identityKey(value: RouterValue | null): string {
	if (value === null) {
		return "-";
	}
	return value.identity.kind === "proven"
		? value.identity.key
		: `lost:${value.identity.reason}`;
}

function recordKey(record: RouterRecord | null): string {
	if (record === null) {
		return "-";
	}
	return [...record.entries()]
		.map(([name, field]) => `${name}=${fieldKey(field)}`)
		.sort()
		.join(",");
}

function fieldKey(field: FieldValue): string {
	if (field.kind === "router") {
		return identityKey(field.value);
	}
	if (field.kind === "zero") {
		return `zero:${field.goType}`;
	}
	return `syntax:${field.directory}#${field.node.startIndex}`;
}

/**
 * The declaration a call names, resolved structurally: a function of this
 * package, a function of an imported one, or a method on a receiver whose
 * declared type the enclosing declaration fixes.
 */
export function calleeOf(
	call: SyntaxNode,
	lookup: CalleeLookup,
): CalleeDeclaration | null {
	const callee = call.childForFieldName("function");
	if (callee === null) {
		return null;
	}
	if (callee.type === "identifier") {
		return declaredIn(lookup.directory, callee.text, lookup, null);
	}
	if (callee.type !== "selector_expression") {
		return null;
	}
	const operand = callee.childForFieldName("operand");
	const field = callee.childForFieldName("field");
	if (operand?.type !== "identifier" || field === null) {
		return null;
	}
	const importPath = lookup.imports.pathOf(operand.text);
	if (importPath !== null) {
		return declaredForImport(importPath, field.text, lookup);
	}
	const receiverType = receiverTypeOf(operand.text, lookup.scope);
	return receiverType === null
		? null
		: declaredIn(lookup.directory, field.text, lookup, receiverType);
}

function declaredIn(
	directory: string,
	name: string,
	lookup: CalleeLookup,
	receiverType: string | null,
): CalleeDeclaration | null {
	const found = lookup.packages.at(directory);
	if (found === null) {
		return null;
	}
	const declaration =
		receiverType === null
			? found.declarations.functionOf(name)
			: found.declarations.methodOf(receiverType, name);
	const relPath = found.declarations.fileOf(
		receiverType === null ? `func:${name}` : `method:${receiverType}.${name}`,
	);
	return declaration === null || relPath === null
		? null
		: { declaration, relPath, directory, imports: found.imports };
}

function declaredForImport(
	importPath: string,
	name: string,
	lookup: CalleeLookup,
): CalleeDeclaration | null {
	const found = lookup.packages.forImport(importPath);
	if (found === null) {
		return null;
	}
	const declaration = found.declarations.functionOf(name);
	const relPath = found.declarations.fileOf(`func:${name}`);
	return declaration === null || relPath === null
		? null
		: {
				declaration,
				relPath,
				directory: found.directory,
				imports: found.imports,
			};
}

/**
 * The unpointered type of a name the enclosing declaration binds: its receiver,
 * one of its parameters, or a local the body binds to a composite literal,
 * which is how a builder is ordinarily constructed before its method is called.
 */
function receiverTypeOf(name: string, scope: SyntaxNode): string | null {
	const lists = [
		scope.childForFieldName("receiver"),
		scope.childForFieldName("parameters"),
	];
	for (const list of lists) {
		for (const entry of list?.namedChildren ?? []) {
			const declared = entry.childForFieldName("name");
			const type = entry.childForFieldName("type");
			if (declared?.text === name && type !== null) {
				return unpointer(type.text);
			}
		}
	}
	return constructedTypeOf(name, scope);
}

function constructedTypeOf(name: string, scope: SyntaxNode): string | null {
	const body = scope.childForFieldName("body");
	if (body === null) {
		return null;
	}
	for (const definition of definitionsIn(body)) {
		const left = definition.childForFieldName("left")?.namedChildren ?? [];
		const right = definition.childForFieldName("right")?.namedChildren ?? [];
		const index = left.findIndex((entry) => entry.text === name);
		const value = index < 0 ? undefined : right[index];
		const type =
			value?.type === "composite_literal"
				? value.childForFieldName("type")
				: null;
		if (type !== null && type !== undefined) {
			return unpointer(type.text);
		}
	}
	return null;
}

function definitionsIn(node: SyntaxNode): readonly SyntaxNode[] {
	const found: SyntaxNode[] = [];
	const walk = (current: SyntaxNode): void => {
		if (
			current.type === "short_var_declaration" ||
			current.type === "assignment_statement"
		) {
			found.push(current);
			return;
		}
		for (const child of current.namedChildren) {
			walk(child);
		}
	};
	walk(node);
	return found;
}

function unpointer(text: string): string {
	return text.startsWith("*") ? text.slice(1) : text;
}
