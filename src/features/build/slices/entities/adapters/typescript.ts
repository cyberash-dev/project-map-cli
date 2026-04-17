import type { Entity, Field, SourceLocation } from "../../../../../core/domain/project-map.js";
import type { Language } from "../../../../../core/domain/language.js";
import type { ParsedFile } from "../../../../../core/ports/parser.port.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class TypeScriptEntitiesAdapter implements ILanguageAdapter<Entity[]> {
  constructor(public readonly language: Language) {}

  async extract(ctx: ExtractionContext): Promise<Entity[]> {
    const entities: Entity[] = [];
    for (const file of ctx.files) {
      if (file.language !== this.language) continue;
      for (const cls of classesIn(file)) {
        const name = classNameOf(cls);
        if (!name || name.startsWith("_")) continue;
        const bases = classHeritage(cls);
        const methods = classMethods(cls);
        const fields = classFields(cls);
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

function classesIn(file: ParsedFile): SyntaxNode[] {
  const root = rootOf(file.tree);
  return findAll(root, (n) => n.type === "class_declaration");
}

function classNameOf(cls: SyntaxNode): string | null {
  const id = cls.childForFieldName("name");
  return id ? id.text : null;
}

function classHeritage(cls: SyntaxNode): string[] {
  const out: string[] = [];
  for (const c of cls.namedChildren) {
    if (c.type === "class_heritage") {
      for (const clause of c.namedChildren) {
        for (const named of clause.namedChildren) {
          if (named.type === "identifier" || named.type === "type_identifier") {
            out.push(named.text);
          }
        }
      }
    }
  }
  return out;
}

function classMethods(cls: SyntaxNode): string[] {
  const body = cls.childForFieldName("body");
  if (!body) return [];
  const names: string[] = [];
  for (const m of body.namedChildren) {
    if (m.type === "method_definition" || m.type === "method_signature") {
      const n = m.childForFieldName("name");
      if (n) names.push(n.text);
    }
  }
  return names;
}

function classFields(cls: SyntaxNode): Field[] {
  const body = cls.childForFieldName("body");
  if (!body) return [];
  const fields: Field[] = [];
  for (const member of body.namedChildren) {
    if (member.type === "public_field_definition" || member.type === "field_definition") {
      const name = member.childForFieldName("name");
      const typeNode = member.childForFieldName("type");
      if (name) {
        const typeText = typeNode ? typeNode.text.replace(/^:\s*/, "").trim() : null;
        fields.push({ name: name.text, type: typeText });
      }
    }
  }
  return fields.slice(0, 12);
}
