import type { SourceAnchor } from "../../../../core/domain/facts/anchor.js";
import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";
import { byteOffsetTable } from "../anchors.js";

export type PythonClass = {
	readonly name: string;
	readonly bases: readonly string[];
	readonly constants: ReadonlyMap<string, string>;
	readonly methods: ReadonlySet<string>;
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
		methods: body === null ? new Set() : readMethods(body),
		anchor: {
			path: relPath,
			start_byte: offsets.byteOffsetAt(node.startIndex),
			end_byte: offsets.byteOffsetAt(node.endIndex),
		},
	};
}

function readBases(node: SyntaxNode): string[] {
	const superclasses = node.childForFieldName("superclasses");
	if (superclasses === null) {
		return [];
	}
	return superclasses.namedChildren
		.filter(
			(child) => child.type === "identifier" || child.type === "attribute",
		)
		.map((child) => child.text);
}

function readConstants(body: SyntaxNode): Map<string, string> {
	const constants = new Map<string, string>();
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
	constants: Map<string, string>,
): void {
	if (node.type !== "assignment") {
		return;
	}
	const target = node.childForFieldName("left");
	const value = node.childForFieldName("right");
	if (target === null || value === null || target.type !== "identifier") {
		return;
	}
	const literal = pythonStringLiteral(value);
	if (literal !== null) {
		constants.set(target.text, literal);
	}
}

function readMethods(body: SyntaxNode): Set<string> {
	const methods = new Set<string>();
	for (const child of body.namedChildren) {
		const statement = undecorated(child);
		if (statement === null || statement.type !== "function_definition") {
			continue;
		}
		const name = statement.childForFieldName("name");
		if (name !== null) {
			methods.add(name.text);
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
