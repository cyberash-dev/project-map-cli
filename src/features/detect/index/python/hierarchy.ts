import { resolveModulePath } from "../module-resolver.js";
import type { PythonClass, PythonDeclarationIndex } from "./declarations.js";
import type { PythonImportIndex } from "./imports.js";

/** Bounds the walk over a hierarchy that a cycle would otherwise run forever. */
const MAX_DEPTH = 16;

export type ModuleView = {
	readonly imports: PythonImportIndex;
	readonly declarations: PythonDeclarationIndex;
};

export type AncestryRequest = {
	readonly view: ModuleView;
	readonly modules: ReadonlyMap<string, ModuleView>;
	readonly sourcePaths: readonly string[];
};

export type Ancestor = {
	readonly name: string;
	readonly origin: string | null;
	readonly declared: PythonClass | null;
	readonly view: ModuleView;
};

/**
 * The classes a name resolves to, most derived first: the declaration itself,
 * then each base, following imports into the modules that declare them. A base
 * whose declaration lies outside the analysis unit still yields its origin, so
 * a declared type can be recognized without being readable.
 */
export function ancestry(
	name: string,
	request: AncestryRequest,
): readonly Ancestor[] {
	const found: Ancestor[] = [];
	const seen = new Set<string>();
	walk({ name, view: request.view }, request, found, seen);
	return found;
}

type Cursor = {
	readonly name: string;
	readonly view: ModuleView;
};

function walk(
	cursor: Cursor,
	request: AncestryRequest,
	found: Ancestor[],
	seen: Set<string>,
): void {
	const declared = cursor.view.declarations.classOf(cursor.name);
	const origin = originOf(cursor);
	/* Keyed on the origin where one resolves: following an import lands on the
	 * same name in the module that declares it, which is not a cycle. */
	const key = origin ?? cursor.name;
	if (found.length > MAX_DEPTH || seen.has(key)) {
		return;
	}
	seen.add(key);
	found.push({ name: cursor.name, origin, declared, view: cursor.view });
	if (declared === null) {
		const elsewhere = followImport(cursor, request);
		if (elsewhere !== null) {
			walk(elsewhere, request, found, seen);
		}
		return;
	}
	for (const base of declared.bases) {
		walk({ name: baseName(base), view: cursor.view }, request, found, seen);
	}
}

/**
 * A generic base is written `Base[T]`; the subscript is not part of the name
 * an import binds.
 */
function baseName(base: string): string {
	const bracket = base.indexOf("[");
	return bracket < 0 ? base : base.slice(0, bracket);
}

function originOf(cursor: Cursor): string | null {
	if (cursor.view.imports.isShadowedLocally(cursor.name)) {
		return null;
	}
	return cursor.view.imports.originOf(cursor.name);
}

function followImport(cursor: Cursor, request: AncestryRequest): Cursor | null {
	const origin = cursor.view.imports.originOf(cursor.name);
	if (origin === null) {
		return null;
	}
	const lastDot = origin.lastIndexOf(".");
	if (lastDot < 0) {
		return null;
	}
	const modulePath = resolveModulePath(
		origin.slice(0, lastDot),
		request.sourcePaths.map((path) => ({ path, text: "" })),
	);
	if (modulePath === null) {
		return null;
	}
	const view = request.modules.get(modulePath);
	return view === undefined ? null : { name: origin.slice(lastDot + 1), view };
}
