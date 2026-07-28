import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	findAll,
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";

export type PythonImportIndex = {
	/** Fully qualified origin of a from-imported symbol, by its local name. */
	originOf(localName: string): string | null;
	/** Module bound by an `import x.y` or `import x.y as z` statement. */
	moduleOf(localName: string): string | null;
	/** Whether a module-level definition binds this name over any import. */
	isShadowedLocally(name: string): boolean;
};

export function pythonImportIndex(file: ParsedFile): PythonImportIndex {
	const root = rootOf(file.tree);
	const origins = new Map<string, string>();
	const modules = new Map<string, string>();
	const localDefinitions = collectLocalDefinitions(root);

	for (const statement of findAll(
		root,
		(node) => node.type === "import_from_statement",
	)) {
		readFromImport(statement, origins);
	}
	for (const statement of findAll(
		root,
		(node) => node.type === "import_statement",
	)) {
		readModuleImport(statement, modules);
	}

	return {
		originOf: (localName) => origins.get(localName) ?? null,
		moduleOf: (localName) => modules.get(localName) ?? null,
		isShadowedLocally: (name) => localDefinitions.has(name),
	};
}

function readFromImport(
	statement: SyntaxNode,
	origins: Map<string, string>,
): void {
	const moduleNode = statement.childForFieldName("module_name");
	if (moduleNode === null) {
		return;
	}
	const module = moduleNode.text;
	for (const child of statement.namedChildren) {
		if (child === moduleNode) {
			continue;
		}
		if (child.type === "dotted_name") {
			origins.set(child.text, `${module}.${child.text}`);
			continue;
		}
		if (child.type === "aliased_import") {
			readAliasedImport(child, (original, local) => {
				origins.set(local, `${module}.${original}`);
			});
		}
	}
}

function readModuleImport(
	statement: SyntaxNode,
	modules: Map<string, string>,
): void {
	for (const child of statement.namedChildren) {
		if (child.type === "dotted_name") {
			modules.set(child.text, child.text);
			continue;
		}
		if (child.type === "aliased_import") {
			readAliasedImport(child, (original, local) => {
				modules.set(local, original);
			});
		}
	}
}

function readAliasedImport(
	node: SyntaxNode,
	bind: (original: string, local: string) => void,
): void {
	const original = node.childForFieldName("name");
	const alias = node.childForFieldName("alias");
	if (original === null || alias === null) {
		return;
	}
	bind(original.text, alias.text);
}

/**
 * A module-level class, function or assignment binds its name over any import
 * of the same name. Without this, a locally defined `Url` would be attributed
 * to whichever library the module happens to import.
 */
function collectLocalDefinitions(root: SyntaxNode): ReadonlySet<string> {
	const names = new Set<string>();
	for (const child of root.namedChildren) {
		if (
			child.type === "class_definition" ||
			child.type === "function_definition"
		) {
			const name = child.childForFieldName("name");
			if (name !== null) {
				names.add(name.text);
			}
			continue;
		}
		if (child.type === "expression_statement") {
			readAssignmentTarget(child, names);
		}
	}
	return names;
}

function readAssignmentTarget(statement: SyntaxNode, names: Set<string>): void {
	for (const child of statement.namedChildren) {
		if (child.type !== "assignment") {
			continue;
		}
		const target = child.childForFieldName("left");
		if (target !== null && target.type === "identifier") {
			names.add(target.text);
		}
	}
}
