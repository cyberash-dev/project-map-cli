import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	findAll,
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";

const MAJOR_VERSION_SEGMENT = /^v[0-9]+$/;

export type GoImportIndex = {
	/** Import path bound to a package qualifier inside this file. */
	pathOf(qualifier: string): string | null;
};

export function goImportIndex(file: ParsedFile): GoImportIndex {
	const byQualifier = new Map<string, string>();
	for (const spec of findAll(
		rootOf(file.tree),
		(node) => node.type === "import_spec",
	)) {
		readImportSpec(spec, byQualifier);
	}
	return { pathOf: (qualifier) => byQualifier.get(qualifier) ?? null };
}

function readImportSpec(
	spec: SyntaxNode,
	byQualifier: Map<string, string>,
): void {
	const pathNode = spec.childForFieldName("path");
	if (pathNode === null) {
		return;
	}
	const importPath = unquote(pathNode);
	const declared = spec.childForFieldName("name");
	const qualifier =
		declared === null ? defaultQualifier(importPath) : declared.text;
	if (qualifier.length > 0) {
		byQualifier.set(qualifier, importPath);
	}
}

function unquote(node: SyntaxNode): string {
	const content = node.namedChildren[0];
	return content === undefined ? "" : content.text;
}

/**
 * Without a compiler the package name is not observable, so the qualifier is
 * the last path segment. Semantic import versioning appends a major-version
 * segment that is never the package name, so `.../chi/v5` binds `chi`.
 */
function defaultQualifier(importPath: string): string {
	const segments = importPath.split("/").filter((part) => part.length > 0);
	const last = segments[segments.length - 1];
	if (last === undefined) {
		return "";
	}
	if (!MAJOR_VERSION_SEGMENT.test(last)) {
		return last;
	}
	return segments[segments.length - 2] ?? last;
}

/**
 * Whether a declared origin names an import path. Matching is on whole path
 * segments from the right, so `go-chi/chi/v5` matches a vendored copy of the
 * same module and never `fake-go-chi/chi/v5`.
 */
export function goOriginMatches(declared: string, importPath: string): boolean {
	return declared === importPath || importPath.endsWith(`/${declared}`);
}
