import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import { type GoDeclarationIndex, goDeclarationIndex } from "./declarations.js";
import { type GoImportIndex, goImportIndex } from "./imports.js";

export type GoPackage = {
	readonly directory: string;
	readonly declarations: GoDeclarationIndex;
	/**
	 * The qualifiers every file of the package binds. A type declared here
	 * names its field types through these, never through the caller's.
	 */
	readonly imports: GoImportIndex;
};

export type GoPackageIndex = {
	/** The package a directory of the analysis unit holds. */
	at(directory: string): GoPackage | null;
	/** The package an import path names, by longest matching path suffix. */
	forImport(importPath: string): GoPackage | null;
	/**
	 * Every package an import path could name. A declared anchor has to know
	 * that its symbol was ambiguous rather than take whichever suffix was
	 * longest, so ambiguity is reported here instead of resolved.
	 */
	matchesFor(importPath: string): readonly GoPackage[];
};

/**
 * Go resolves a package to a directory, and every file in it contributes. The
 * analysis unit is rooted inside the module and never sees the prefix an import
 * path is written from, so the match is on path suffixes, longest first.
 */
export function goPackageIndex(files: readonly ParsedFile[]): GoPackageIndex {
	const byDirectory = new Map<string, ParsedFile[]>();
	for (const file of files) {
		const directory = directoryOf(file.relPath);
		byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), file]);
	}
	const packages = new Map<string, GoPackage>();
	for (const [directory, members] of byDirectory) {
		packages.set(directory, {
			directory,
			declarations: goDeclarationIndex(members),
			imports: mergedImports(members),
		});
	}
	return {
		at: (directory) => packages.get(directory) ?? null,
		forImport: (importPath) => resolveImport(importPath, packages),
		matchesFor: (importPath) => matchingImports(importPath, packages),
	};
}

function mergedImports(files: readonly ParsedFile[]): GoImportIndex {
	const indexes = files.map((file) => goImportIndex(file));
	return {
		pathOf: (qualifier) => {
			for (const index of indexes) {
				const found = index.pathOf(qualifier);
				if (found !== null) {
					return found;
				}
			}
			return null;
		},
	};
}

function directoryOf(relPath: string): string {
	const cut = relPath.lastIndexOf("/");
	return cut < 0 ? "" : relPath.slice(0, cut);
}

function matchingImports(
	importPath: string,
	packages: ReadonlyMap<string, GoPackage>,
): readonly GoPackage[] {
	const segments = importPath.split("/").filter((part) => part.length > 0);
	const found: GoPackage[] = [];
	for (let start = 0; start < segments.length; start++) {
		const match = packages.get(segments.slice(start).join("/"));
		if (match !== undefined) {
			found.push(match);
		}
	}
	return found;
}

function resolveImport(
	importPath: string,
	packages: ReadonlyMap<string, GoPackage>,
): GoPackage | null {
	const segments = importPath.split("/").filter((part) => part.length > 0);
	for (let start = 0; start < segments.length; start++) {
		const found = packages.get(segments.slice(start).join("/"));
		if (found !== undefined) {
			return found;
		}
	}
	return null;
}
