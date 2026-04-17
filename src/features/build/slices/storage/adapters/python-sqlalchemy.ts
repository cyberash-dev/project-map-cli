import type { SourceLocation, Table } from "../../../../../core/domain/project-map.js";
import {
  childText,
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractPythonSqlAlchemyTables(ctx: ExtractionContext): Promise<Table[]> {
  const baseClass = ctx.config.storage.baseClass;
  const tables: Table[] = [];
  for (const file of ctx.files) {
    if (file.language !== "python") continue;
    const root = rootOf(file.tree);
    for (const cls of findAll(root, (n) => n.type === "class_definition")) {
      if (!inheritsFrom(cls, baseClass)) continue;
      const name = childText(cls, "name");
      if (!name) continue;
      const tableName = readTableName(cls) ?? snakeCase(name);
      const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
      tables.push({ table: tableName, model: name, source });
    }
  }
  return tables;
}

function inheritsFrom(cls: SyntaxNode, base: string): boolean {
  const sc = cls.childForFieldName("superclasses");
  if (!sc) return false;
  for (const arg of sc.namedChildren) {
    const last = arg.text.split(".").pop() ?? arg.text;
    if (last === base) return true;
  }
  return false;
}

function readTableName(cls: SyntaxNode): string | null {
  const body = cls.childForFieldName("body");
  if (!body) return null;
  for (const stmt of body.namedChildren) {
    if (stmt.type !== "expression_statement") continue;
    const inner = stmt.namedChildren[0];
    if (!inner || inner.type !== "assignment") continue;
    const left = inner.childForFieldName("left");
    if (!left || left.text !== "__tablename__") continue;
    const right = inner.childForFieldName("right");
    if (!right || right.type !== "string") continue;
    return right.text.replace(/^["'](.*)["']$/s, "$1");
  }
  return null;
}

function snakeCase(s: string): string {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
