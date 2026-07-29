import type { Destination } from "../../../core/domain/facts/fact.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { Selector } from "../../../core/ports/config.port.js";
import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";
import type { Ancestor } from "../index/python/hierarchy.js";
import type { PythonImportIndex } from "../index/python/imports.js";
import { keywordArguments } from "../inbound/argument-selector.js";
import { foldPythonValue } from "../value/python-value.js";

export type DestinationRequest = {
	readonly selector: Selector | null;
	/** The construction the receiver resolves to, when it resolves to one. */
	readonly instance: SyntaxNode | null;
	/** Whether the receiver is the enclosing declaration's own instance. */
	readonly isOwnInstance: boolean;
	/** Every construction of the enclosing type found inside the unit. */
	readonly ownConstructions: readonly SyntaxNode[];
	readonly ancestry: readonly Ancestor[];
	readonly imports: PythonImportIndex;
};

/**
 * The ladder of project-map:BEH-011. The first applicable step that yields a
 * value wins and is recorded as evidence; a step that is inapplicable consumes
 * no budget, so an exhausted ladder is typed by why it ran out rather than by
 * how far it got.
 */
export function resolveDestinations(
	request: DestinationRequest,
): readonly Destination[] {
	if (request.selector === null) {
		return [{ kind: "unknown", reason: "operation_mapping_unresolved" }];
	}
	const fromInstance = fromConstructions(
		request.instance === null ? [] : [request.instance],
		request,
		"instance",
	);
	if (fromInstance.length > 0) {
		return fromInstance;
	}
	const fromOwner = request.isOwnInstance
		? fromConstructions(request.ownConstructions, request, "owner_construction")
		: [];
	if (fromOwner.length > 0) {
		return fromOwner;
	}
	const declared = fromDeclaration(request);
	return declared.length > 0 ? declared : [exhausted(request)];
}

function fromConstructions(
	constructions: readonly SyntaxNode[],
	request: DestinationRequest,
	binding: "instance" | "owner_construction",
): readonly Destination[] {
	const found = constructions
		.map((construction) => argumentValue(construction, request))
		.filter((value): value is ValueIr => value !== null)
		.filter((value) => value.kind !== "unknown")
		.map((ref) => destinationOf(ref, binding));
	return dedupe(found);
}

/**
 * A construction binds the selector only through a named argument: a class
 * constant is bound by the declaration, which is the step below.
 */
function argumentValue(
	construction: SyntaxNode,
	request: DestinationRequest,
): ValueIr | null {
	const step = request.selector?.[0];
	if (step === undefined || step.kind !== "arg") {
		return null;
	}
	const args = construction.childForFieldName("arguments");
	if (args === null) {
		return null;
	}
	const positional = args.namedChildren.filter(
		(node) => node.type !== "keyword_argument",
	);
	const node =
		typeof step.selector === "number"
			? (positional[step.selector] ?? null)
			: (keywordArguments(args).get(step.selector) ?? null);
	return node === null ? null : foldPythonValue(node, request.imports);
}

/** The most derived ancestor that binds the selector wins. */
function fromDeclaration(request: DestinationRequest): readonly Destination[] {
	const step = request.selector?.[0];
	if (step === undefined || step.kind !== "class_const") {
		return [];
	}
	for (const ancestor of request.ancestry) {
		const bound = ancestor.declared?.constants.get(step.selector);
		if (bound === undefined) {
			continue;
		}
		const value = foldPythonValue(bound, ancestor.view.imports);
		if (value.kind !== "unknown") {
			return [destinationOf(value, "owner_declaration")];
		}
	}
	return [];
}

/**
 * A ladder that yielded nothing is typed by what stopped it: a hierarchy that
 * leaves the unit is a boundary, and a receiver nothing proved is dispatch.
 */
function exhausted(request: DestinationRequest): Destination {
	const readable = request.ancestry.some(
		(ancestor) => ancestor.declared !== null,
	);
	if (!readable) {
		return { kind: "unknown", reason: "cross_boundary" };
	}
	return { kind: "unknown", reason: "open_world_dispatch" };
}

function destinationOf(
	ref: ValueIr,
	binding: "instance" | "owner_construction" | "owner_declaration",
): Destination {
	return {
		kind: ref.kind === "config_ref" ? "config_ref" : "literal",
		ref,
		binding,
	};
}

function dedupe(destinations: readonly Destination[]): readonly Destination[] {
	const byKey = new Map<string, Destination>();
	for (const destination of destinations) {
		byKey.set(JSON.stringify(destination), destination);
	}
	return [...byKey.values()];
}
