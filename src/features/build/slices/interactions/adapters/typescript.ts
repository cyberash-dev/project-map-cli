import type { Interaction } from "../../../../../core/domain/project-map.js";
import type { ParsedFile } from "../../../../../core/ports/parser.port.js";
import {
  findAll,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractTypeScriptInteractions(ctx: ExtractionContext): Promise<Interaction[]> {
  const dir = ctx.config.interactions.dir;
  if (!dir) return [];
  const norm = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const byDir = new Map<string, ParsedFile[]>();
  for (const file of ctx.files) {
    if (file.language !== "typescript" && file.language !== "javascript") continue;
    if (!file.relPath.startsWith(`${norm}/`)) continue;
    const remainder = file.relPath.slice(norm.length + 1);
    const parts = remainder.split("/");
    if (parts.length < 2) continue;
    const sub = parts[0] ?? "";
    const key = `${norm}/${sub}`;
    const arr = byDir.get(key) ?? [];
    arr.push(file);
    byDir.set(key, arr);
  }

  const results: Interaction[] = [];
  for (const [directory, files] of byDir.entries()) {
    let clientClass: string | null = null;
    const methods: string[] = [];
    for (const file of files) {
      const root = rootOf(file.tree);
      for (const cls of findAll(root, (n) => n.type === "class_declaration")) {
        const name = cls.childForFieldName("name");
        if (!name || !name.text.endsWith("Client")) continue;
        clientClass = name.text;
        const body = cls.childForFieldName("body");
        if (!body) break;
        for (const m of body.namedChildren) {
          if (m.type === "method_definition" || m.type === "method_signature") {
            const mn = m.childForFieldName("name");
            if (mn && !mn.text.startsWith("_")) methods.push(mn.text);
          }
        }
        break;
      }
      if (clientClass) break;
    }
    if (!clientClass) continue;
    results.push({
      directory,
      clientClass,
      baseUrlFrom: null,
      methods: methods.slice(0, 10),
      usedBy: [],
    });
  }
  results.sort((a, b) => a.directory.localeCompare(b.directory));
  return results;
}

export function _unused(_: SyntaxNode): void {}
