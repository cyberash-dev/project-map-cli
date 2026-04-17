import type { SourceLocation, Worker } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractTypeScriptWorkers(ctx: ExtractionContext): Promise<Worker[]> {
  const workers: Worker[] = [];
  for (const file of ctx.files) {
    if (file.language !== "typescript" && file.language !== "javascript") continue;
    const root = rootOf(file.tree);
    for (const cls of findAll(root, (n) => n.type === "class_declaration")) {
      const nameNode = cls.childForFieldName("name");
      if (!nameNode) continue;
      const name = nameNode.text;
      if (!/Worker$|Processor$|Handler$/.test(name)) continue;
      const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
      workers.push({ name, source, subscribesTo: [], handler: null });
    }
  }
  workers.sort((a, b) => a.name.localeCompare(b.name));
  return workers;
}
