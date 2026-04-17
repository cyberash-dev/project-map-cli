import type { Heading, Root, RootContent } from "mdast";
import type { EnumType } from "../../../../core/domain/project-map.js";
import { bulletList, heading, inlineCode, paragraph } from "../../rendering/mdast-helpers.js";

export function renderEnums(enums: readonly EnumType[]): Root["children"] {
  if (enums.length === 0) return [];
  const children: RootContent[] = [heading(2, "Enums")];
  for (const e of enums) {
    const h: Heading = { type: "heading", depth: 3, children: [inlineCode(e.name)] };
    children.push(h);
    children.push(paragraph([inlineCode(`${e.source.file}:${e.source.line}`)]));
    children.push(bulletList(e.members.map((m) => m)));
  }
  return children;
}
