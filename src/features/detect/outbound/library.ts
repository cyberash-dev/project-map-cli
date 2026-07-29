import type {
	SourceAnchor,
	SymbolValue,
} from "../../../core/domain/facts/anchor.js";
import type {
	Destination,
	OutboundOperationFact,
} from "../../../core/domain/facts/fact.js";
import { reasonsOf } from "../../../core/domain/facts/value-ir.js";
import type { ModuleIdMapping } from "../../../core/ports/config.port.js";
import type { Ancestor } from "../index/python/hierarchy.js";
import { originMatches } from "../index/module-resolver.js";

/** The reasons that name an operation the analysis unit cannot read. */
const IN_LIBRARY: ReadonlySet<string> = new Set([
	"operation_in_library",
	"operation_in_library_root",
]);

/**
 * The module a type belongs to. The mapping is declared against the type the
 * library publishes, so every local subclass of it carries the same identity
 * without being named in the configuration.
 */
export function moduleIdOfAncestry(
	ancestors: readonly Ancestor[],
	mappings: readonly ModuleIdMapping[],
): string | null {
	for (const mapping of mappings) {
		const claimed = ancestors.some((ancestor) =>
			namesType(mapping.type, ancestor),
		);
		if (claimed) {
			return mapping.moduleId;
		}
	}
	return null;
}

function namesType(configured: string, ancestor: Ancestor): boolean {
	const names = [ancestor.origin, ancestor.qualifiedName];
	return names.some((name) => name !== null && originMatches(configured, name));
}

/** The declaration anchor of a member, taken from the ancestor that declares it. */
export function memberAnchor(
	ancestors: readonly Ancestor[],
	member: string,
): SourceAnchor | null {
	for (const ancestor of ancestors) {
		const anchor = ancestor.declared?.methods.get(member);
		if (anchor !== undefined) {
			return anchor;
		}
	}
	return null;
}

export function symbolOf(
	anchor: SourceAnchor,
	displayName: string,
): SymbolValue {
	return { kind: "symbol", declaration: anchor, display_name: displayName };
}

/**
 * A destination the library itself does not bind belongs to whoever configures
 * the library, so on a half carrying a module id an exhausted ladder is typed
 * by that fact rather than by how the ladder ran out.
 */
export function inLibraryDestinations(
	destinations: readonly Destination[],
): readonly Destination[] {
	return destinations.map((destination) =>
		destination.kind === "unknown"
			? { kind: "unknown", reason: "operation_in_library_root" }
			: destination,
	);
}

/**
 * Whether every unresolved required field of a fact names an operation body
 * outside the unit. Such a half is the linker's to complete, so it is counted
 * apart from the sites this run could have resolved and did not.
 */
export function isDeferredToLinker(fact: OutboundOperationFact): boolean {
	if (fact.resolution === "resolved") {
		return false;
	}
	const holes = fact.operation.variants.flatMap(holesOf);
	return holes.length > 0 && holes.every((reason) => IN_LIBRARY.has(reason));
}

function holesOf(
	variant: OutboundOperationFact["operation"]["variants"][number],
): readonly string[] {
	if (!("http" in variant)) {
		return reasonsOf(variant.queue.topic);
	}
	const { method, path, destination } = variant.http;
	const reasons = [method, path].flatMap(reasonsOf);
	if (destination === undefined) {
		return [...reasons, "operation_mapping_unresolved"];
	}
	return destination.kind === "unknown"
		? [...reasons, destination.reason]
		: [...reasons, ...reasonsOf(destination.ref)];
}
