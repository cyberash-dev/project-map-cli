import type { SourceLocation } from "../../../core/domain/project-map.js";

export type NamedDeclaration = {
	readonly name: string;
	readonly source: SourceLocation;
};

/**
 * Display names, qualified only where a bare name has more than one claimant.
 * A service-sized repository holds many types called `Config`, and a document
 * spelling them all the same reports an entity that does not exist.
 */
export function qualifiedNames(
	declarations: readonly NamedDeclaration[],
): readonly string[] {
	const claimants = new Map<string, string[]>();
	for (const declaration of declarations) {
		const directories = claimants.get(declaration.name) ?? [];
		directories.push(directoryOf(declaration.source.file));
		claimants.set(declaration.name, directories);
	}
	return declarations.map((declaration) => {
		const directories = claimants.get(declaration.name) ?? [];
		if (directories.length < 2) {
			return declaration.name;
		}
		const qualifier = shortestDistinguishing(
			directoryOf(declaration.source.file),
			directories,
		);
		return qualifier === ""
			? declaration.name
			: `${qualifier}.${declaration.name}`;
	});
}

function directoryOf(file: string): string {
	const lastSlash = file.lastIndexOf("/");
	return lastSlash < 0 ? "" : file.slice(0, lastSlash);
}

/**
 * The fewest trailing path segments that separate this directory from the
 * others claiming the name. Two declarations in one directory cannot be told
 * apart by their path, so the whole path is the last thing tried.
 */
function shortestDistinguishing(
	directory: string,
	claimants: readonly string[],
): string {
	const segments = directory.split("/").filter((part) => part.length > 0);
	for (let depth = 1; depth <= segments.length; depth++) {
		const candidate = segments.slice(segments.length - depth).join("/");
		const sharing = claimants.filter(
			(other) => suffixOf(other, depth) === candidate,
		);
		if (sharing.length === 1) {
			return candidate;
		}
	}
	return segments.join("/");
}

function suffixOf(directory: string, depth: number): string {
	const segments = directory.split("/").filter((part) => part.length > 0);
	return segments.slice(Math.max(0, segments.length - depth)).join("/");
}
