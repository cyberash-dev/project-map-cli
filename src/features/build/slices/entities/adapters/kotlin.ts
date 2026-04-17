import type { Entity, Field, SourceLocation } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class KotlinEntitiesAdapter implements ILanguageAdapter<Entity[]> {
  readonly language = "kotlin" as const;

  async extract(ctx: ExtractionContext): Promise<Entity[]> {
    const entities: Entity[] = [];
    for (const file of ctx.files) {
      if (file.language !== "kotlin") continue;
      const root = rootOf(file.tree);
      for (const cls of findAll(root, (n) => n.type === "class_declaration")) {
        const nameNode = findIdentifier(cls);
        if (!nameNode) continue;
        if (hasModifier(cls, "enum")) continue;
        const body = findBody(cls);
        const methods: string[] = [];
        const fields: Field[] = [];
        if (body) {
          for (const member of body.namedChildren) {
            if (member.type === "function_declaration") {
              const n = findIdentifier(member);
              if (n) methods.push(n.text);
            }
            if (member.type === "property_declaration") {
              const vn = findIdentifier(member);
              if (vn) fields.push({ name: vn.text, type: null });
            }
          }
        }
        if (methods.length < 2) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
        entities.push({
          name: nameNode.text,
          source,
          inherits: [],
          fields: fields.slice(0, 12),
          methods: methods.slice(0, 8),
          referencedFrom: 0,
          importance: 0,
        });
      }
    }
    return entities;
  }
}

function findIdentifier(node: SyntaxNode): SyntaxNode | null {
  for (const c of node.namedChildren) {
    if (c.type === "simple_identifier" || c.type === "identifier") return c;
  }
  return null;
}

function findBody(node: SyntaxNode): SyntaxNode | null {
  for (const c of node.namedChildren) {
    if (c.type === "class_body") return c;
  }
  return null;
}

function hasModifier(node: SyntaxNode, keyword: string): boolean {
  for (const c of node.namedChildren) {
    if (c.type === "modifiers") {
      if (c.text.includes(keyword)) return true;
    }
  }
  return false;
}
