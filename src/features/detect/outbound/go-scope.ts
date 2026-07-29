import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { SelectorStep } from "../../../core/ports/config.port.js";
import type { ParsedFile } from "../../../core/ports/parser.port.js";
import {
	findAll,
	type SyntaxNode,
} from "../../../infrastructure/parser/ts-utils.js";
import { type GoImportIndex, goOriginMatches } from "../index/go/imports.js";
import type { GoPackage, GoPackageIndex } from "../index/go/packages.js";
import { foldGoConfigRef } from "../value/go-config.js";
import { foldGoValue } from "../value/go-value.js";
import type { RecordValue } from "../value/record.js";

export type GoModule = {
	readonly file: ParsedFile;
	readonly imports: GoImportIndex;
	readonly directory: string;
};

export type GoAncestor = {
	readonly name: string;
	readonly origin: string | null;
	readonly declared: boolean;
};

/**
 * The types a Go type composes, most derived first. Composition is embedding:
 * a member with a type and no name of its own. A qualified embedding yields its
 * import origin, so a type declared outside the unit is still recognized.
 */
export function goAncestry(
	typeName: string,
	module: GoModule,
	packages: GoPackageIndex,
): readonly GoAncestor[] {
	const found: GoAncestor[] = [];
	const seen = new Set<string>();
	walk(typeName, module, packages, found, seen);
	return found;
}

function walk(
	typeName: string,
	module: GoModule,
	packages: GoPackageIndex,
	found: GoAncestor[],
	seen: Set<string>,
): void {
	const cut = typeName.indexOf(".");
	const qualifier = cut < 0 ? null : typeName.slice(0, cut);
	const bare = cut < 0 ? typeName : typeName.slice(cut + 1);
	const target =
		qualifier === null
			? packages.at(module.directory)
			: packageOf(qualifier, module, packages);
	const origin = originOf(qualifier, bare, module);
	const key = origin ?? `${module.directory}.${bare}`;
	if (found.length > 8 || seen.has(key)) {
		return;
	}
	seen.add(key);
	const declared = target?.declarations.typeOf(bare) ?? null;
	found.push({ name: bare, origin, declared: declared !== null });
	if (declared === null || target === null) {
		return;
	}
	const inner = innerModule(qualifier, module, target);
	for (const embedded of declared.embedded) {
		walk(embedded, inner, packages, found, seen);
	}
}

function packageOf(
	qualifier: string,
	module: GoModule,
	packages: GoPackageIndex,
): GoPackage | null {
	const importPath = module.imports.pathOf(qualifier);
	return importPath === null ? null : packages.forImport(importPath);
}

function originOf(
	qualifier: string | null,
	bare: string,
	module: GoModule,
): string | null {
	if (qualifier === null) {
		return null;
	}
	const importPath = module.imports.pathOf(qualifier);
	return importPath === null ? null : `${importPath}.${bare}`;
}

/**
 * Crossing into another package changes which imports a name resolves through,
 * so the walk carries the module of whichever file declared the type.
 */
function innerModule(
	qualifier: string | null,
	module: GoModule,
	target: GoPackage,
): GoModule {
	if (qualifier === null) {
		return module;
	}
	return { ...module, directory: target.directory };
}

export function goOriginClaims(
	ancestors: readonly GoAncestor[],
	baseType: string,
): boolean {
	return ancestors.some(
		(ancestor) =>
			ancestor.origin !== null && goOriginMatches(baseType, ancestor.origin),
	);
}

/** Applies a selector chain: an `arg` step, then `field` steps over a record. */
export function resolveChain(
	steps: readonly SelectorStep[],
	args: readonly SyntaxNode[],
	records: ReadonlyMap<string, RecordValue>,
): SyntaxNode | null {
	const [first, ...rest] = steps;
	if (first === undefined || first.kind !== "arg") {
		return null;
	}
	const start =
		typeof first.selector === "number" ? (args[first.selector] ?? null) : null;
	if (start === null || rest.length === 0) {
		return start;
	}
	if (start.type !== "identifier") {
		return null;
	}
	return followFields(records.get(start.text) ?? null, rest);
}

function followFields(
	record: RecordValue | null,
	steps: readonly SelectorStep[],
): SyntaxNode | null {
	const [step, ...rest] = steps;
	if (record === null || step === undefined || step.kind !== "field") {
		return null;
	}
	const bound = record.get(step.selector) ?? null;
	return rest.length === 0 ? bound : null;
}

export type GoFoldContext = {
	readonly module: GoModule;
	readonly packages: GoPackageIndex;
};

/**
 * Folds a Go expression, following a qualified constant into the package that
 * declares it. A typed constant is the ordinary way an HTTP verb is written.
 */
export function foldGoSinkValue(
	node: SyntaxNode | null,
	context: GoFoldContext,
	depth = 0,
): ValueIr {
	if (node === null || depth > 3) {
		return { kind: "unknown", reason: "dynamic" };
	}
	const direct = foldGoValue(node);
	if (direct.kind !== "unknown") {
		return direct;
	}
	const bound = constantOf(node, context);
	return bound === null ? direct : foldGoSinkValue(bound, context, depth + 1);
}

function constantOf(
	node: SyntaxNode,
	context: GoFoldContext,
): SyntaxNode | null {
	if (node.type === "identifier") {
		return (
			context.packages
				.at(context.module.directory)
				?.declarations.constOf(node.text) ?? null
		);
	}
	if (node.type !== "selector_expression") {
		return null;
	}
	const operand = node.childForFieldName("operand");
	const field = node.childForFieldName("field");
	if (operand === null || field === null || operand.type !== "identifier") {
		return null;
	}
	const importPath = context.module.imports.pathOf(operand.text);
	if (importPath === null) {
		return null;
	}
	return (
		context.packages.forImport(importPath)?.declarations.constOf(field.text) ??
		null
	);
}

/**
 * The declared type of a name bound in the enclosing function's parameters,
 * qualified by the import it resolves through. A configuration locator names
 * that type rather than the variable that happened to carry it.
 */
export function parameterType(
	name: string,
	scope: SyntaxNode,
	module: GoModule,
): string | null {
	const owner = enclosingFunction(scope);
	if (owner === null) {
		return null;
	}
	for (const declaration of findAll(
		owner,
		(node) => node.type === "parameter_declaration",
	)) {
		const declared = declaration.childForFieldName("name");
		const type = declaration.childForFieldName("type");
		if (declared?.text === name && type !== null) {
			return qualifiedType(type.text, module);
		}
	}
	return null;
}

function qualifiedType(text: string, module: GoModule): string | null {
	const bare = text.startsWith("*") ? text.slice(1) : text;
	const cut = bare.indexOf(".");
	if (cut < 0) {
		return `${module.directory}.${bare}`;
	}
	const importPath = module.imports.pathOf(bare.slice(0, cut));
	return importPath === null ? null : `${importPath}${bare.slice(cut)}`;
}

export function enclosingFunction(node: SyntaxNode): SyntaxNode | null {
	let cursor: SyntaxNode | null | undefined = node;
	while (cursor !== null && cursor !== undefined) {
		if (
			cursor.type === "function_declaration" ||
			cursor.type === "method_declaration"
		) {
			return cursor;
		}
		cursor = cursor.parent;
	}
	return null;
}

/**
 * The fields a constructor gives a record. A field the caller never assigns
 * keeps whatever the summary bound it to, which is how a default verb survives.
 */
export type ConstructorSummary = {
	readonly fields: ReadonlyMap<string, SyntaxNode>;
	/** The package that declared the literal, for folding its bare names. */
	readonly directory: string | null;
};

export function constructorSummary(
	value: SyntaxNode,
	context: GoFoldContext,
): ConstructorSummary {
	const found = calledFunction(value, context);
	const body = found?.declaration.childForFieldName("body") ?? null;
	if (body === null || found === null) {
		return { fields: new Map(), directory: null };
	}
	for (const literal of findAll(
		body,
		(node) => node.type === "composite_literal",
	)) {
		const fields = keyedFields(literal);
		if (fields.size > 0) {
			return { fields, directory: found.directory };
		}
	}
	return { fields: new Map(), directory: null };
}

type FoundFunction = {
	readonly declaration: SyntaxNode;
	readonly directory: string;
};

function calledFunction(
	value: SyntaxNode,
	context: GoFoldContext,
): FoundFunction | null {
	const callee =
		value.type === "call_expression"
			? value.childForFieldName("function")
			: null;
	if (callee === null) {
		return null;
	}
	if (callee.type === "identifier") {
		return foundIn(context.packages.at(context.module.directory), callee.text);
	}
	if (callee.type !== "selector_expression") {
		return null;
	}
	const operand = callee.childForFieldName("operand");
	const field = callee.childForFieldName("field");
	if (operand?.type !== "identifier" || field === null) {
		return null;
	}
	const importPath = context.module.imports.pathOf(operand.text);
	const target =
		importPath === null ? null : context.packages.forImport(importPath);
	return foundIn(target, field.text);
}

function foundIn(target: GoPackage | null, name: string): FoundFunction | null {
	const declaration = target?.declarations.functionOf(name) ?? null;
	if (declaration === null || target === null) {
		return null;
	}
	return { declaration, directory: target.directory };
}

/* A keyed element wraps both halves in a literal_element; the value the field
 * holds is inside it. */
function unwrapElement(node: SyntaxNode | null): SyntaxNode | null {
	if (node === null || node.type !== "literal_element") {
		return node;
	}
	return node.namedChildren[0] ?? null;
}

function keyedFields(literal: SyntaxNode): Map<string, SyntaxNode> {
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

export function goConfigFold(
	node: SyntaxNode | null,
	context: GoFoldContext,
): ValueIr {
	if (node === null) {
		return { kind: "unknown", reason: "dynamic" };
	}
	const asConfig = foldGoConfigRef(node, node, (name, scope) =>
		parameterType(name, scope, context.module),
	);
	return asConfig ?? foldGoSinkValue(node, context);
}

export function goModulesOf(
	files: readonly ParsedFile[],
	imports: (file: ParsedFile) => GoImportIndex,
): readonly GoModule[] {
	return files.map((file) => ({
		file,
		imports: imports(file),
		directory: file.relPath.includes("/")
			? file.relPath.slice(0, file.relPath.lastIndexOf("/"))
			: "",
	}));
}
