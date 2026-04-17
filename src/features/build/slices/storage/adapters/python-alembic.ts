import type { Migration, SourceLocation } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractPythonAlembicMigrations(ctx: ExtractionContext): Promise<Migration[]> {
  const dir = ctx.config.storage.migrationsDir;
  if (!dir) return [];
  const dirNorm = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const migrations: Migration[] = [];
  for (const file of ctx.files) {
    if (file.language !== "python") continue;
    if (!file.relPath.startsWith(`${dirNorm}/`) && file.relPath !== dirNorm) continue;
    const root = rootOf(file.tree);
    let revision: string | null = null;
    let downRevision: string | null = null;
    const tables = new Set<string>();
    const opsSummary: string[] = [];

    for (const stmt of root.namedChildren) {
      if (stmt.type !== "expression_statement") continue;
      const inner = stmt.namedChildren[0];
      if (!inner || inner.type !== "assignment") continue;
      const left = inner.childForFieldName("left");
      const right = inner.childForFieldName("right");
      if (!left || !right) continue;
      if (left.text === "revision" && right.type === "string") {
        revision = unquote(right.text);
      } else if (left.text === "down_revision" && right.type === "string") {
        downRevision = unquote(right.text);
      }
    }
    if (!revision) continue;

    for (const fnDef of findAll(root, (n) => n.type === "function_definition")) {
      const name = fnDef.childForFieldName("name");
      if (!name || name.text !== "upgrade") continue;
      for (const call of findAll(fnDef, (n) => n.type === "call")) {
        const fn = call.childForFieldName("function");
        if (!fn) continue;
        const fnText = fn.text;
        const opMatch = /^op\.(create_table|drop_table|add_column|drop_column|alter_column|rename_table|create_index|drop_index)$/.exec(
          fnText,
        );
        if (!opMatch) continue;
        const op = opMatch[1];
        if (op) opsSummary.push(op);
        const args = call.childForFieldName("arguments");
        if (!args) continue;
        const first = args.namedChildren[0];
        if (first && first.type === "string") tables.add(unquote(first.text));
      }
    }

    const summary = opsSummary.length === 0 ? "(no operations detected)" : dedupe(opsSummary).join(", ");
    const source: SourceLocation = { file: file.relPath, line: 1 };
    migrations.push({
      revision,
      downRevision,
      tables: [...tables],
      summary,
      source,
    });
  }
  return migrations;
}

function unquote(s: string): string {
  return s.replace(/^["'](.*)["']$/s, "$1");
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

// No-op re-export so we can later swap in tree-cursor-based traversal per-function.
export function _internalProbe(_: SyntaxNode): void {}
