import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import { type GoDeclarationIndex, goDeclarationIndex } from "./declarations.js";

export type GoPackage = {
	readonly directory: string;
	readonly declarations: GoDeclarationIndex;
};

export type GoPackageIndex = {
	/** The package a directory of the analysis unit holds. */
	at(directory: string): GoPackage | null;
	/** The package an import path names, by longest matching path suffix. */
	forImport(importPath: string): GoPackage | null;
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
		});
	}
	return {
		at: (directory) => packages.get(directory) ?? null,
		forImport: (importPath) => resolveImport(importPath, packages),
	};
}

function directoryOf(relPath: string): string {
	const cut = relPath.lastIndexOf("/");
	return cut < 0 ? "" : relPath.slice(0, cut);
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
