import type { Root } from "mdast";
import type { BoundedContext } from "../../../../core/domain/project-map.js";
import { section, table } from "../../rendering/mdast-helpers.js";

export function renderContexts(contexts: readonly BoundedContext[]): Root["children"] {
  if (contexts.length === 0) return [];
  return [
    ...section("Bounded contexts", 2),
    table(
      ["Path", "Files", "Role"],
      contexts.map((c) => [c.path, String(c.fileCount), c.role]),
      ["left", "right", "left"],
    ),
  ];
}
