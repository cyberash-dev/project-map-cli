import type { Root, RootContent } from "mdast";
import type { Interaction } from "../../../../core/domain/project-map.js";
import { bulletList, heading, inlineCode, paragraph, text } from "../../rendering/mdast-helpers.js";

export function renderInteractions(list: readonly Interaction[]): Root["children"] {
  if (list.length === 0) return [];
  const out: RootContent[] = [heading(2, "External dependencies")];
  for (const item of list) {
    out.push({
      type: "heading",
      depth: 3,
      children: [inlineCode(item.directory)],
    });
    const facts: RootContent[] = [];
    facts.push(
      paragraph([text("Client class: "), inlineCode(item.clientClass)]),
    );
    if (item.baseUrlFrom) {
      facts.push(
        paragraph([text("Base URL from: "), inlineCode(item.baseUrlFrom)]),
      );
    }
    if (item.methods.length > 0) {
      facts.push(paragraph([text(`Methods (${item.methods.length}):`)]));
      facts.push(bulletList(item.methods.map((m) => m)));
    }
    if (item.usedBy.length > 0) {
      facts.push(paragraph([text(`Used by: ${item.usedBy.slice(0, 5).join(", ")}`)]));
    }
    for (const f of facts) out.push(f);
  }
  return out;
}
