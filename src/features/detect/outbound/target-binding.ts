import type { Destination } from "../../../core/domain/facts/fact.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type {
	Selector,
	SelectorStep,
} from "../../../core/ports/config.port.js";
import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";

export type DestinationBinding =
	| "instance"
	| "owner_construction"
	| "owner_declaration";

export type DestinationRequest = {
	readonly selector: Selector | null;
	/** The construction the receiver resolves to, when it resolves to one. */
	readonly instance: SyntaxNode | null;
	/** Whether the receiver is the enclosing declaration's own instance. */
	readonly isOwnInstance: boolean;
	/** Every construction of the enclosing type found inside the unit. */
	readonly ownConstructions: readonly SyntaxNode[];
	/** Declaration-level bindings of each ancestor, most derived first. */
	readonly declaredBindings: readonly ReadonlyMap<string, SyntaxNode>[];
	/** Whether any ancestor's declaration lies inside the analysis unit. */
	readonly readable: boolean;
	readonly fold: (node: SyntaxNode | null) => ValueIr;
	readonly argumentOf: (
		construction: SyntaxNode,
		step: SelectorStep,
	) => SyntaxNode | null;
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
	const step = request.selector?.[0];
	if (step === undefined || step.kind !== "arg") {
		return [];
	}
	return dedupe(
		constructions
			.map((construction) => request.argumentOf(construction, step))
			.filter((node): node is SyntaxNode => node !== null)
			.map((node) => request.fold(node))
			.filter((value) => value.kind !== "unknown")
			.map((ref) => destinationOf(ref, binding)),
	);
}

/** The most derived ancestor that binds the selector wins. */
function fromDeclaration(request: DestinationRequest): readonly Destination[] {
	const step = request.selector?.[0];
	if (step === undefined || step.kind !== "class_const") {
		return [];
	}
	for (const bindings of request.declaredBindings) {
		const bound = bindings.get(step.selector);
		if (bound === undefined) {
			continue;
		}
		const value = request.fold(bound);
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
	if (!request.readable) {
		return { kind: "unknown", reason: "cross_boundary" };
	}
	return { kind: "unknown", reason: "open_world_dispatch" };
}

function destinationOf(ref: ValueIr, binding: DestinationBinding): Destination {
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
