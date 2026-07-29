import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";
import { findAll } from "../../../infrastructure/parser/ts-utils.js";

/** A finite map from field to the node that last wrote it. */
export type RecordValue = ReadonlyMap<string, SyntaxNode>;

export type RecordSeed = (construction: SyntaxNode) => RecordValue;

/**
 * The record lattice of project-map:CTR-007, over one scope. A record is seeded
 * from the expression that bound it and every later assignment to a field is a
 * strong update, so a field written twice holds what the last write gave it.
 */
export function recordsOf(
	scope: SyntaxNode,
	seed: RecordSeed,
): ReadonlyMap<string, RecordValue> {
	const records = new Map<string, Map<string, SyntaxNode>>();
	for (const statement of findAll(scope, isBinding)) {
		if (statement.type === "field_write") {
			continue;
		}
		applyBinding(statement, records, seed);
	}
	return records;
}

function isBinding(node: SyntaxNode): boolean {
	return (
		node.type === "short_var_declaration" ||
		node.type === "assignment_statement" ||
		node.type === "var_spec"
	);
}

function applyBinding(
	statement: SyntaxNode,
	records: Map<string, Map<string, SyntaxNode>>,
	seed: RecordSeed,
): void {
	const targets = targetsOf(statement);
	const values = valuesOf(statement);
	targets.forEach((target, index) => {
		const value = values[index];
		if (value === undefined) {
			return;
		}
		if (target.type === "selector_expression") {
			writeField(target, value, records);
			return;
		}
		if (target.type === "identifier") {
			records.set(target.text, new Map(seed(value)));
		}
	});
}

/** A write through a field is a strong update of that field alone. */
function writeField(
	target: SyntaxNode,
	value: SyntaxNode,
	records: Map<string, Map<string, SyntaxNode>>,
): void {
	const owner = target.childForFieldName("operand");
	const field = target.childForFieldName("field");
	if (owner === null || field === null || owner.type !== "identifier") {
		return;
	}
	const record = records.get(owner.text);
	if (record === undefined) {
		return;
	}
	record.set(field.text, value);
}

function targetsOf(statement: SyntaxNode): readonly SyntaxNode[] {
	if (statement.type === "var_spec") {
		return statement.namedChildren.filter(
			(child) => child.type === "identifier",
		);
	}
	return statement.childForFieldName("left")?.namedChildren ?? [];
}

function valuesOf(statement: SyntaxNode): readonly SyntaxNode[] {
	const key = statement.type === "var_spec" ? "value" : "right";
	return statement.childForFieldName(key)?.namedChildren ?? [];
}
