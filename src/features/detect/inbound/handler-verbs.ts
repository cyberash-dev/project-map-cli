import type { SyntaxNode } from "../../../infrastructure/parser/ts-utils.js";
import { resolveModulePath } from "../index/module-resolver.js";
import type { PythonDeclarationIndex } from "../index/python/declarations.js";
import type { PythonImportIndex } from "../index/python/imports.js";

const HTTP_VERBS: ReadonlySet<string> = new Set([
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options",
]);

/** Bounds the walk over a hierarchy that a cycle would otherwise run forever. */
const MAX_HIERARCHY_DEPTH = 16;

export type ModuleLike = {
	readonly imports: PythonImportIndex;
	readonly declarations: PythonDeclarationIndex;
};

export type VerbRequest = {
	readonly handlerNode: SyntaxNode | null;
	readonly view: ModuleLike;
	readonly modules: ReadonlyMap<string, ModuleLike>;
	readonly sourcePaths: readonly string[];
};

/**
 * The verbs a handler answers are the HTTP-named members it declares, plus the
 * ones it inherits. A handler that declares none and inherits one answers that
 * one, which is why the walk crosses module boundaries rather than stopping at
 * the class body.
 */
export function verbsOfHandler(request: VerbRequest): readonly string[] {
	if (
		request.handlerNode === null ||
		request.handlerNode.type !== "identifier"
	) {
		return [];
	}
	const verbs = new Set<string>();
	collectVerbs(
		{ name: request.handlerNode.text, view: request.view },
		request,
		verbs,
		0,
	);
	return [...verbs].sort();
}

type Cursor = {
	readonly name: string;
	readonly view: ModuleLike;
};

function collectVerbs(
	cursor: Cursor,
	request: VerbRequest,
	verbs: Set<string>,
	depth: number,
): void {
	if (depth > MAX_HIERARCHY_DEPTH) {
		return;
	}
	const declared = cursor.view.declarations.classOf(cursor.name);
	if (declared === null) {
		const elsewhere = followImport(cursor, request);
		if (elsewhere !== null) {
			collectVerbs(elsewhere, request, verbs, depth + 1);
		}
		return;
	}
	for (const member of declared.methods) {
		if (HTTP_VERBS.has(member)) {
			verbs.add(member.toUpperCase());
		}
	}
	for (const base of declared.bases) {
		collectVerbs({ name: base, view: cursor.view }, request, verbs, depth + 1);
	}
}

function followImport(cursor: Cursor, request: VerbRequest): Cursor | null {
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
	if (view === undefined) {
		return null;
	}
	return { name: origin.slice(lastDot + 1), view };
}
