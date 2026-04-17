import type { Entity, Field, SourceLocation } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class GoEntitiesAdapter implements ILanguageAdapter<Entity[]> {
  readonly language = "go" as const;

  async extract(ctx: ExtractionContext): Promise<Entity[]> {
    const entities: Entity[] = [];
    const methodsByReceiver = new Map<string, string[]>();

    for (const file of ctx.files) {
      if (file.language !== "go") continue;
      const root = rootOf(file.tree);
      for (const fn of findAll(root, (n) => n.type === "method_declaration")) {
        const receiver = fn.childForFieldName("receiver");
        const name = fn.childForFieldName("name");
        if (!receiver || !name) continue;
        const recvType = extractGoReceiverType(receiver);
        if (!recvType) continue;
        if (!methodsByReceiver.has(recvType)) methodsByReceiver.set(recvType, []);
        methodsByReceiver.get(recvType)?.push(name.text);
      }
    }

    for (const file of ctx.files) {
      if (file.language !== "go") continue;
      const root = rootOf(file.tree);
      for (const td of findAll(root, (n) => n.type === "type_declaration")) {
        for (const spec of td.namedChildren) {
          if (spec.type !== "type_spec") continue;
          const nameNode = spec.childForFieldName("name");
          const bodyNode = spec.childForFieldName("type");
          if (!nameNode || !bodyNode) continue;
          if (bodyNode.type !== "struct_type") continue;
          const name = nameNode.text;
          if (!name || name[0] !== (name[0] ?? "").toUpperCase()) continue;
          const fields = extractGoFields(bodyNode);
          const methods = methodsByReceiver.get(name) ?? [];
          if (methods.length === 0 && fields.length < 2) continue;
          const source: SourceLocation = { file: file.relPath, line: line1Based(spec) };
          entities.push({
            name,
            source,
            inherits: [],
            fields,
            methods: methods.slice(0, 8),
            referencedFrom: 0,
            importance: 0,
          });
        }
      }
    }
    return entities;
  }
}

function extractGoReceiverType(receiver: SyntaxNode): string | null {
  for (const n of receiver.namedChildren) {
    if (n.type === "parameter_declaration") {
      const t = n.childForFieldName("type");
      if (!t) continue;
      if (t.type === "pointer_type") {
        const inner = t.namedChildren[0];
        return inner ? inner.text : null;
      }
      return t.text;
    }
  }
  return null;
}

function extractGoFields(structType: SyntaxNode): Field[] {
  const fields: Field[] = [];
  const fieldList = structType.namedChildren.find((c) => c.type === "field_declaration_list");
  if (!fieldList) return fields;
  for (const decl of fieldList.namedChildren) {
    if (decl.type !== "field_declaration") continue;
    const typeNode = decl.childForFieldName("type");
    const names: string[] = [];
    for (const c of decl.namedChildren) {
      if (c.type === "field_identifier") names.push(c.text);
    }
    for (const n of names) {
      if (n[0] !== (n[0] ?? "").toUpperCase()) continue;
      fields.push({ name: n, type: typeNode ? typeNode.text : null });
    }
  }
  return fields.slice(0, 12);
}
