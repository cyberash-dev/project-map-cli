import type { ClientRegistry } from "../../../core/ports/config.port.js";
import { originMatches } from "../index/module-resolver.js";
import {
	ancestry,
	type AncestryRequest,
	dottedModuleName,
	type ModuleView,
} from "../index/python/hierarchy.js";

/** A type name together with the module whose imports resolve it. */
export type ResolvedType = {
	readonly name: string;
	readonly view: ModuleView;
};

export type RegistryIndex = {
	/** The type a receiver written as a declared container access resolves to. */
	typeOf(receiverText: string): ResolvedType | null;
};

export type RegistryRequest = {
	readonly registries: readonly ClientRegistry[];
	readonly modules: ReadonlyMap<string, ModuleView>;
	readonly sourcePaths: readonly string[];
};

/**
 * Resolves `<access>.<attribute>` against the container the configuration
 * declares. The container's own declaration binds each attribute to a type, so
 * the receiver's identity is read rather than inferred from a value that flows.
 */
export function clientRegistryIndex(request: RegistryRequest): RegistryIndex {
	const byAccess = new Map<string, ReadonlyMap<string, ResolvedType>>();
	for (const entry of request.registries) {
		byAccess.set(entry.access, attributesOf(entry.containerType, request));
	}
	return {
		typeOf: (receiverText) => lookup(receiverText, byAccess),
	};
}

function lookup(
	receiverText: string,
	byAccess: ReadonlyMap<string, ReadonlyMap<string, ResolvedType>>,
): ResolvedType | null {
	for (const [access, attributes] of byAccess) {
		const prefix = `${access}.`;
		if (!receiverText.startsWith(prefix)) {
			continue;
		}
		const attribute = receiverText.slice(prefix.length);
		if (attribute.includes(".")) {
			continue;
		}
		const found = attributes.get(attribute);
		if (found !== undefined) {
			return found;
		}
	}
	return null;
}

/**
 * The attributes of the container and of every base it inherits from. Each
 * attribute keeps the module that annotated it, because the type it names is
 * resolved by that module's imports and not by the caller's.
 */
function attributesOf(
	containerType: string,
	request: RegistryRequest,
): ReadonlyMap<string, ResolvedType> {
	const merged = new Map<string, ResolvedType>();
	const declaration = findContainer(containerType, request);
	if (declaration === null) {
		return merged;
	}
	const ancestors = ancestry(declaration.name, {
		view: declaration.view,
		modules: request.modules,
		sourcePaths: request.sourcePaths,
	} satisfies AncestryRequest);
	for (const ancestor of ancestors) {
		for (const [attribute, type] of ancestor.declared?.attributes ?? []) {
			if (!merged.has(attribute)) {
				merged.set(attribute, { name: type, view: ancestor.view });
			}
		}
	}
	return merged;
}

function findContainer(
	containerType: string,
	request: RegistryRequest,
): { readonly name: string; readonly view: ModuleView } | null {
	for (const view of request.modules.values()) {
		const module = dottedModuleName(view.path);
		if (module === null) {
			continue;
		}
		for (const declared of view.declarations.classes()) {
			if (originMatches(containerType, `${module}.${declared.name}`)) {
				return { name: declared.name, view };
			}
		}
	}
	return null;
}
