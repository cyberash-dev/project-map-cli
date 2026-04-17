import type { Root, RootContent } from "mdast";
import type { Worker } from "../../../../core/domain/project-map.js";
import { bulletList, heading, inlineCode, paragraph, text } from "../../rendering/mdast-helpers.js";

export function renderWorkers(workers: readonly Worker[]): Root["children"] {
  if (workers.length === 0) return [];
  const out: RootContent[] = [heading(2, "Workers")];
  for (const w of workers) {
    out.push({ type: "heading", depth: 3, children: [inlineCode(w.name)] });
    out.push(
      paragraph([text("Source: "), inlineCode(`${w.source.file}:${w.source.line}`)]),
    );
    if (w.handler) {
      out.push(paragraph([text("Handler: "), inlineCode(w.handler)]));
    }
    if (w.subscribesTo.length > 0) {
      out.push(paragraph([text("Subscribes to:")]));
      out.push(bulletList(w.subscribesTo.map((e) => e)));
    }
  }
  return out;
}
