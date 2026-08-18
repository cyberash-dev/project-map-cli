import type { UnitSource } from "../../../core/ports/analysis-unit.port.js";

/**
 * Maps a dotted module name onto a source in the analysis unit. Progressively
 * shorter suffixes are tried, longest first, because the unit is rooted inside
 * the package tree and never sees the prefix a module is named from.
 */
export function resolveModulePath(
	dottedModule: string,
	sources: readonly UnitSource[],
): string | null {
	const known = new Set(sources.map((source) => source.path));
	const segments = dottedModule.split(".");
	for (let start = 0; start < segments.length; start++) {
		const suffix = segments.slice(start).join("/");
		const asModule = `${suffix}.py`;
		if (known.has(asModule)) {
			return asModule;
		}
		const asPackage = `${suffix}/__init__.py`;
		if (known.has(asPackage)) {
			return asPackage;
		}
	}
	return null;
}

/**
 * Whether a configured type matches a resolved origin. Matching is on whole
 * dotted segments from the right, so `routing_dsl.Url` matches
 * `vendor.routing_dsl.Url` and never `other_routing_dsl.Url`.
 */
export function originMatches(configured: string, origin: string): boolean {
	if (configured === origin) {
		return true;
	}
	return origin.endsWith(`.${configured}`);
}
