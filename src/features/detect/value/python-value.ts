import {
	POSITIONAL_HOLE,
	type ValueIr,
} from "../../../core/domain/facts/value-ir.js";
import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";
import { pythonStringLiteral } from "../index/python/declarations.js";
import type { PythonImportIndex } from "../index/python/imports.js";
import { concatValues, templateOf } from "./template.js";

const DYNAMIC: ValueIr = { kind: "unknown", reason: "dynamic" };

/**
 * Folds a Python expression to the value IR of project-map:CTR-007. A dotted
 * read rooted at an imported name is a configuration locator, never its value:
 * resolving a key to a per-environment value is the linker's work.
 */
export function foldPythonValue(
	node: SyntaxNode | null,
	imports: PythonImportIndex,
): ValueIr {
	if (node === null) {
		return DYNAMIC;
	}
	if (node.type === "string") {
		return foldString(node, imports);
	}
	if (node.type === "parenthesized_expression") {
		return foldPythonValue(node.namedChildren[0] ?? null, imports);
	}
	if (node.type === "attribute") {
		return foldAttribute(node, imports);
	}
	if (node.type === "binary_operator") {
		return foldConcatenation(node, imports);
	}
	return DYNAMIC;
}

/**
 * An f-string is a template whose interpolations stayed unproven. Rendering it
 * as its literal runs alone would invent a route nobody declared.
 */
function foldString(node: SyntaxNode, imports: PythonImportIndex): ValueIr {
	const interpolations = node.namedChildren.filter(
		(child) => child.type === "interpolation",
	);
	if (interpolations.length === 0) {
		return { kind: "literal", value: pythonStringLiteral(node) ?? "" };
	}
	return templateOf(
		node.namedChildren
			.filter(
				(child) =>
					child.type === "string_content" || child.type === "interpolation",
			)
			.map((child) =>
				child.type === "string_content"
					? child.text
					: foldInterpolation(child, imports),
			),
	);
}

/**
 * A bare name substituted into a string is a path parameter, which the grammar
 * of project-map:CTR-007 reduces to a positional hole. A richer expression is
 * not a parameter and stays typed.
 */
function foldInterpolation(
	node: SyntaxNode,
	imports: PythonImportIndex,
): string | ValueIr {
	if (node.type !== "interpolation") {
		return DYNAMIC;
	}
	const expression = node.namedChildren[0];
	if (expression?.type === "identifier") {
		return POSITIONAL_HOLE;
	}
	return foldPythonValue(expression ?? null, imports);
}

function foldAttribute(node: SyntaxNode, imports: PythonImportIndex): ValueIr {
	const segments = dottedSegments(node);
	const [root, ...rest] = segments;
	if (root === undefined || rest.length === 0) {
		return DYNAMIC;
	}
	const origin = imports.originOf(root) ?? imports.moduleOf(root);
	if (origin === null || imports.isShadowedLocally(root)) {
		return DYNAMIC;
	}
	return {
		kind: "config_ref",
		ref: { declaration: origin, path_segments: rest },
	};
}

function dottedSegments(node: SyntaxNode): readonly string[] {
	if (node.type === "identifier") {
		return [node.text];
	}
	if (node.type !== "attribute") {
		return [];
	}
	const object = node.childForFieldName("object");
	const attribute = node.childForFieldName("attribute");
	if (object === null || attribute === null) {
		return [];
	}
	const prefix = dottedSegments(object);
	return prefix.length === 0 ? [] : [...prefix, attribute.text];
}

function foldConcatenation(
	node: SyntaxNode,
	imports: PythonImportIndex,
): ValueIr {
	const operator = node.childForFieldName("operator");
	if (operator === null || operator.text !== "+") {
		return DYNAMIC;
	}
	return concatValues(
		foldPythonValue(node.childForFieldName("left"), imports),
		foldPythonValue(node.childForFieldName("right"), imports),
	);
}
