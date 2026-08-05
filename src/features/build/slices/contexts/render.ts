import type { Root } from "mdast";
import type { BoundedContext } from "../../../../core/domain/project-map.js";
import { codeCell, section, table } from "../../rendering/mdast-helpers.js";

export function renderContexts(
	contexts: readonly BoundedContext[],
): Root["children"] {
	if (contexts.length === 0) {
		return [];
	}
	return [
		...section("Bounded contexts", 2),
		table(
			["Path", "Role"],
			contexts.map((c) => [codeCell(c.path), c.role]),
			["left", "left"],
		),
	];
}
