import type { Heading, Root, RootContent } from "mdast";
import type { EnumType } from "../../../../core/domain/project-map.js";
import {
	bulletList,
	heading,
	inlineCode,
	paragraph,
} from "../../rendering/mdast-helpers.js";
import { qualifiedNames } from "../../rendering/qualified-name.js";

export function renderEnums(enums: readonly EnumType[]): Root["children"] {
	if (enums.length === 0) {
		return [];
	}
	const children: RootContent[] = [heading(2, "Enums")];
	const displayNames = qualifiedNames(enums);
	for (const [index, e] of enums.entries()) {
		const h: Heading = {
			type: "heading",
			depth: 3,
			children: [inlineCode(displayNames[index] ?? e.name)],
		};
		children.push(h);
		children.push(paragraph([inlineCode(`${e.source.file}:${e.source.line}`)]));
		children.push(
			bulletList(
				e.members.map((m) => ({
					type: "paragraph" as const,
					children: [inlineCode(m)],
				})),
			),
		);
	}
	return children;
}
