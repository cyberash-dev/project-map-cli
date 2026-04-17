import type { SourceLocation, Table } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractTypeScriptTables(ctx: ExtractionContext): Promise<Table[]> {
  const tables: Table[] = [];
  for (const file of ctx.files) {
    if (file.language !== "typescript" && file.language !== "javascript") continue;
    const root = rootOf(file.tree);
    for (const cls of findAll(root, (n) => n.type === "class_declaration")) {
      const entityAnnotation = findAnnotationArg(cls, "Entity");
      if (entityAnnotation === undefined) continue;
      const nameNode = cls.childForFieldName("name");
      if (!nameNode) continue;
      const table = entityAnnotation ?? snakeCase(nameNode.text);
      const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
      tables.push({ table, model: nameNode.text, source });
    }
  }
  return tables;
}

function findAnnotationArg(cls: SyntaxNode, decoratorName: string): string | null | undefined {
  let decorators: SyntaxNode[] = [];
  const parent = cls.parent;
  if (parent) {
    decorators = parent.namedChildren.filter((c) => c.type === "decorator");
  }
  for (const dec of decorators) {
    const call = dec.namedChildren[0];
    if (!call) continue;
    if (call.type === "call_expression") {
      const fn = call.childForFieldName("function");
      if (fn && fn.text === decoratorName) {
        const args = call.childForFieldName("arguments");
        if (!args) return null;
        const first = args.namedChildren[0];
        if (first && (first.type === "string" || first.type === "template_string")) {
          return first.text.replace(/^[`'"](.*)[`'"]$/s, "$1");
        }
        return null;
      }
    } else if (call.type === "identifier" && call.text === decoratorName) {
      return null;
    }
  }
  return undefined;
}

function snakeCase(s: string): string {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
