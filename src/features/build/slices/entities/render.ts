import type { Heading, PhrasingContent, Root, RootContent } from "mdast";
import type { Entity } from "../../../../core/domain/project-map.js";
import { bulletList, heading, inlineCode, text } from "../../rendering/mdast-helpers.js";

export function renderEntities(entities: readonly Entity[]): Root["children"] {
  if (entities.length === 0) return [];
  const children: RootContent[] = [heading(2, "Domain entities")];
  for (const e of entities) {
    const h: Heading = { type: "heading", depth: 3, children: [inlineCode(e.name)] };
    children.push(h);

    const bullets: PhrasingContent[][] = [];
    bullets.push([text("Source: "), inlineCode(`${e.source.file}:${e.source.line}`)]);
    if (e.inherits.length > 0) {
      bullets.push([text("Inherits: "), inlineCode(e.inherits.join(", "))]);
    }
    if (e.referencedFrom > 0) {
      bullets.push([text(`Referenced from ${e.referencedFrom} module(s)`)]);
    }
    if (e.methods.length > 0) {
      bullets.push([text("Methods: "), inlineCode(e.methods.join(", "))]);
    }
    children.push({
      type: "list",
      ordered: false,
      spread: false,
      children: bullets.map((pc) => ({
        type: "listItem",
        spread: false,
        children: [{ type: "paragraph", children: pc }],
      })),
    });
    if (e.fields.length > 0) {
      children.push({
        type: "paragraph",
        children: [text(`Fields (${e.fields.length}):`)],
      });
      children.push(bulletList(e.fields.map((f) => (f.type ? `${f.name}: ${f.type}` : f.name))));
    }
  }
  return children;
}
