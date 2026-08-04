import type {
	EnumType,
	SourceLocation,
} from "../../../../../core/domain/project-map.js";
import {
	childText,
	findAll,
	line1Based,
	rootOf,
	type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class PythonEnumsAdapter implements ILanguageAdapter<EnumType[]> {
	readonly language = "python" as const;

	extract(ctx: ExtractionContext): Promise<EnumType[]> {
		const bases = new Set(
			ctx.config.enums.baseClasses.map((b) => b.split(".").pop() ?? b),
		);
		const enums: EnumType[] = [];
		for (const file of ctx.files) {
			if (file.language !== "python") {
				continue;
			}
			const root = rootOf(file.tree);
			for (const cls of findAll(root, (n) => n.type === "class_definition")) {
				const name = childText(cls, "name");
				if (!name) {
					continue;
				}
				const sc = cls.childForFieldName("superclasses");
				if (!sc) {
					continue;
				}
				let isEnum = false;
				for (const arg of sc.namedChildren) {
					const last = (arg.text.split(".").pop() ?? arg.text).replace(
						/\s/g,
						"",
					);
					if (bases.has(last)) {
						isEnum = true;
						break;
					}
				}
				if (!isEnum) {
					continue;
				}
				const members = readMembers(cls);
				if (members.length === 0) {
					continue;
				}
				const source: SourceLocation = {
					file: file.relPath,
					line: line1Based(cls),
				};
				enums.push({ name: qualifiedName(cls, name), source, members });
			}
		}
		enums.sort((a, b) => a.name.localeCompare(b.name));
		return Promise.resolve(enums);
	}
}

/**
 * A class nested in another is named by the chain that reaches it: four
 * exception classes may each declare a `ReasonCode`, and reporting them all as
 * `ReasonCode` reports one type that does not exist.
 */
function qualifiedName(cls: SyntaxNode, name: string): string {
	const owners: string[] = [];
	let cursor = cls.parent ?? null;
	while (cursor !== null) {
		if (cursor.type === "class_definition") {
			const owner = childText(cursor, "name");
			if (owner) {
				owners.unshift(owner);
			}
		}
		cursor = cursor.parent ?? null;
	}
	return [...owners, name].join(".");
}

function readMembers(cls: SyntaxNode): string[] {
	const body = cls.childForFieldName("body");
	if (!body) {
		return [];
	}
	const names: string[] = [];
	for (const stmt of body.namedChildren) {
		if (stmt.type !== "expression_statement") {
			continue;
		}
		const inner = stmt.namedChildren[0];
		if (!inner || inner.type !== "assignment") {
			continue;
		}
		const left = inner.childForFieldName("left");
		if (!left || left.type !== "identifier") {
			continue;
		}
		if (left.text.startsWith("_")) {
			continue;
		}
		names.push(left.text);
	}
	return names;
}
