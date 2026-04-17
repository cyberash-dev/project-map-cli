import type { Entity, Field, SourceLocation } from "../../../../../core/domain/project-map.js";
import type { ParsedFile } from "../../../../../core/ports/parser.port.js";
import {
  childText,
  findAll,
  line1Based,
  namedChildrenOfType,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class PythonEntitiesAdapter implements ILanguageAdapter<Entity[]> {
  readonly language = "python" as const;

  async extract(ctx: ExtractionContext): Promise<Entity[]> {
    const includePrivate = ctx.config.entities.includePrivateMethods;
    const includeFields = ctx.config.entities.includeFields;
    const enumBases = new Set(
      ctx.config.enums.baseClasses.map((b) => b.split(".").pop() ?? b),
    );
    const entities: Entity[] = [];
    for (const file of ctx.files) {
      if (file.language !== "python") continue;
      for (const cls of findClassDefs(file)) {
        const name = childText(cls, "name");
        if (!name) continue;
        if (name.startsWith("_")) continue;
        const bases = readBases(cls);
        if (bases.some((b) => enumBases.has(b))) continue;
        const methods = readMethods(cls, includePrivate);
        const fields = includeFields ? readFields(cls) : [];
        if (methods.length < 2 && bases.length === 0) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
        entities.push({
          name,
          source,
          inherits: bases,
          fields,
          methods: methods.slice(0, 8),
          referencedFrom: 0,
          importance: 0,
        });
      }
    }
    return entities;
  }
}

function findClassDefs(file: ParsedFile): SyntaxNode[] {
  const root = rootOf(file.tree);
  return findAll(root, (n) => n.type === "class_definition");
}

function readBases(cls: SyntaxNode): string[] {
  const argList = cls.childForFieldName("superclasses");
  if (!argList) return [];
  const out: string[] = [];
  for (const arg of argList.namedChildren) {
    if (arg.type === "identifier" || arg.type === "attribute") out.push(arg.text);
    else if (arg.type === "subscript") out.push(arg.text);
  }
  return out;
}

function readMethods(cls: SyntaxNode, includePrivate: boolean): string[] {
  const body = cls.childForFieldName("body");
  if (!body) return [];
  const names: string[] = [];
  for (const child of body.namedChildren) {
    if (child.type === "function_definition") {
      const name = childText(child, "name");
      if (!name) continue;
      if (!includePrivate && name.startsWith("_") && !isDunder(name)) continue;
      names.push(name);
    } else if (child.type === "decorated_definition") {
      const defNode = namedChildrenOfType(child, "function_definition")[0];
      if (!defNode) continue;
      const name = childText(defNode, "name");
      if (!name) continue;
      if (!includePrivate && name.startsWith("_") && !isDunder(name)) continue;
      names.push(name);
    }
  }
  return names;
}

function isDunder(name: string): boolean {
  return name.startsWith("__") && name.endsWith("__");
}

function readFields(cls: SyntaxNode): Field[] {
  const body = cls.childForFieldName("body");
  if (!body) return [];
  const fields: Field[] = [];
  for (const child of body.namedChildren) {
    if (child.type === "expression_statement") {
      const inner = child.namedChildren[0];
      if (!inner) continue;
      if (inner.type === "assignment") {
        const left = inner.childForFieldName("left");
        if (!left || left.type !== "identifier") continue;
        if (left.text.startsWith("_")) continue;
        fields.push({ name: left.text, type: null });
      }
    }
    if (child.type === "annotated_assignment") {
      const target = child.childForFieldName("target") ?? child.namedChildren[0];
      const annotation =
        child.childForFieldName("annotation") ?? child.namedChildren[1] ?? null;
      if (!target || target.type !== "identifier") continue;
      if (target.text.startsWith("_")) continue;
      fields.push({ name: target.text, type: annotation ? annotation.text : null });
    }
  }
  return fields.slice(0, 12);
}
