import type { SourceAnchor } from "../../../../core/domain/facts/anchor.js";
import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";
import { byteOffsetTable } from "../anchors.js";

const BASE_NODES: ReadonlySet<string> = new Set([
	"identifier",
	"attribute",
	"subscript",
]);

export type PythonClass = {
	readonly name: string;
	readonly bases: readonly string[];
	/** Class-level assignments, held as nodes: a constant is not always a string. */
	readonly constants: ReadonlyMap<string, SyntaxNode>;
	readonly methods: ReadonlyMap<string, SourceAnchor>;
	/** Annotated class attributes, by attribute name, as the type they name. */
	readonly attributes: ReadonlyMap<string, string>;
	readonly anchor: SourceAnchor;
};

export type PythonDeclarationIndex = {
	classOf(name: string): PythonClass | null;
	classes(): readonly PythonClass[];
};

export function pythonDeclarationIndex(
	file: ParsedFile,
): PythonDeclarationIndex {
	const offsets = byteOffsetTable(file.content);
	const byName = new Map<string, PythonClass>();
	for (const child of rootOf(file.tree).namedChildren) {
		const node = undecorated(child);
		if (node === null || node.type !== "class_definition") {
			continue;
		}
		const declared = readClass(node, file.relPath, offsets);
		if (declared !== null) {
			byName.set(declared.name, declared);
		}
	}
	return {
		classOf: (name) => byName.get(name) ?? null,
		classes: () => [...byName.values()],
	};
}

function readClass(
	node: SyntaxNode,
	relPath: string,
	offsets: ReturnType<typeof byteOffsetTable>,
): PythonClass | null {
	const name = node.childForFieldName("name");
	if (name === null) {
		return null;
	}
	const body = node.childForFieldName("body");
	return {
		name: name.text,
		bases: readBases(node),
		constants: body === null ? new Map() : readConstants(body),
		methods: body === null ? new Map() : readMethods(body, relPath, offsets),
		attributes: body === null ? new Map() : readAttributes(body),
		anchor: anchorOf(node, relPath, offsets),
	};
}

function anchorOf(
	node: SyntaxNode,
	relPath: string,
	offsets: ReturnType<typeof byteOffsetTable>,
): SourceAnchor {
	return {
		path: relPath,
		start_byte: offsets.byteOffsetAt(node.startIndex),
		end_byte: offsets.byteOffsetAt(node.endIndex),
	};
}

/**
 * An attribute annotated in a class body binds a name to a type without any
 * value flowing: the annotation is the proof, so a container of clients is
 * readable without following a construction.
 */
function readAttributes(body: SyntaxNode): Map<string, string> {
	const attributes = new Map<string, string>();
	for (const statement of body.namedChildren) {
		if (statement.type !== "expression_statement") {
			continue;
		}
		for (const child of statement.namedChildren) {
			readAnnotatedAttribute(child, attributes);
		}
	}
	return attributes;
}

function readAnnotatedAttribute(
	node: SyntaxNode,
	attributes: Map<string, string>,
): void {
	if (node.type !== "assignment") {
		return;
	}
	const target = node.childForFieldName("left");
	const annotation = node.childForFieldName("type");
	if (target === null || annotation === null || target.type !== "identifier") {
		return;
	}
	attributes.set(target.text, annotation.text);
}

function readBases(node: SyntaxNode): string[] {
	const superclasses = node.childForFieldName("superclasses");
	if (superclasses === null) {
		return [];
	}
	/* A generic base is written `Base[T]`; the subscript is not part of the
	 * name an import binds, so the caller trims it. */
	return superclasses.namedChildren
		.filter((child) => BASE_NODES.has(child.type))
		.map((child) => child.text);
}

function readConstants(body: SyntaxNode): Map<string, SyntaxNode> {
	const constants = new Map<string, SyntaxNode>();
	for (const statement of body.namedChildren) {
		if (statement.type !== "expression_statement") {
			continue;
		}
		for (const child of statement.namedChildren) {
			readConstantAssignment(child, constants);
		}
	}
	return constants;
}

function readConstantAssignment(
	node: SyntaxNode,
	constants: Map<string, SyntaxNode>,
): void {
	if (node.type !== "assignment") {
		return;
	}
	const target = node.childForFieldName("left");
	const value = node.childForFieldName("right");
	if (target === null || value === null || target.type !== "identifier") {
		return;
	}
	constants.set(target.text, value);
}

function readMethods(
	body: SyntaxNode,
	relPath: string,
	offsets: ReturnType<typeof byteOffsetTable>,
): Map<string, SourceAnchor> {
	const methods = new Map<string, SourceAnchor>();
	for (const child of body.namedChildren) {
		const statement = undecorated(child);
		if (statement === null || statement.type !== "function_definition") {
			continue;
		}
		const name = statement.childForFieldName("name");
		if (name !== null) {
			methods.set(name.text, anchorOf(statement, relPath, offsets));
		}
	}
	return methods;
}

/**
 * A decorator wraps the definition it applies to, so a decorated member is a
 * `decorated_definition` carrying the real one. Nearly every handler verb in a
 * schema-validated service is decorated.
 */
function undecorated(node: SyntaxNode): SyntaxNode | null {
	if (node.type !== "decorated_definition") {
		return node;
	}
	return node.childForFieldName("definition");
}

/**
 * Folds a Python string literal, including the raw and prefixed forms the
 * route tables use, to the characters it denotes.
 */
export function pythonStringLiteral(node: SyntaxNode): string | null {
	if (node.type !== "string") {
		return null;
	}
	const content = node.namedChildren.find(
		(child) => child.type === "string_content",
	);
	return content?.text ?? "";
}
