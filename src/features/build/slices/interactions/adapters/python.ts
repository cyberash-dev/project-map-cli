import type { Interaction } from "../../../../../core/domain/project-map.js";
import type { ParsedFile } from "../../../../../core/ports/parser.port.js";
import {
  childText,
  findAll,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractPythonInteractions(ctx: ExtractionContext): Promise<Interaction[]> {
  const dir = ctx.config.interactions.dir;
  if (!dir) return [];
  const norm = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const byDir = new Map<string, ParsedFile[]>();
  for (const file of ctx.files) {
    if (file.language !== "python") continue;
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
    let baseUrlFrom: string | null = null;
    for (const file of files) {
      const root = rootOf(file.tree);
      for (const cls of findAll(root, (n) => n.type === "class_definition")) {
        const name = childText(cls, "name");
        if (!name || !name.endsWith("Client")) continue;
        clientClass = name;
        for (const method of collectMethods(cls)) {
          if (!method.startsWith("_") && !methods.includes(method)) methods.push(method);
        }
        const envRef = findBaseUrlSetting(cls);
        if (envRef && !baseUrlFrom) baseUrlFrom = envRef;
        break;
      }
      if (clientClass) break;
    }
    if (!clientClass) continue;
    results.push({
      directory,
      clientClass,
      baseUrlFrom,
      methods: methods.slice(0, 10),
      usedBy: [],
    });
  }
  results.sort((a, b) => a.directory.localeCompare(b.directory));
  return results;
}

function collectMethods(cls: SyntaxNode): string[] {
  const body = cls.childForFieldName("body");
  if (!body) return [];
  const methods: string[] = [];
  for (const m of body.namedChildren) {
    if (m.type === "function_definition") {
      const n = childText(m, "name");
      if (n) methods.push(n);
    }
  }
  return methods;
}

function findBaseUrlSetting(cls: SyntaxNode): string | null {
  const body = cls.childForFieldName("body");
  if (!body) return null;
  for (const m of body.namedChildren) {
    if (m.type !== "function_definition") continue;
    const name = childText(m, "name");
    if (name !== "__init__") continue;
    for (const call of findAll(m, (n) => n.type === "attribute")) {
      const t = call.text;
      if (t.startsWith("conf.") || t.startsWith("settings.") || /SETTINGS\./.test(t)) {
        return t;
      }
    }
  }
  return null;
}
