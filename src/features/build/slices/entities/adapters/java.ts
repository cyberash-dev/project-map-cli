import type { Entity, Field, SourceLocation } from "../../../../../core/domain/project-map.js";
import { findAll, line1Based, rootOf } from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class JavaEntitiesAdapter implements ILanguageAdapter<Entity[]> {
  readonly language = "java" as const;

  async extract(ctx: ExtractionContext): Promise<Entity[]> {
    const entities: Entity[] = [];
    for (const file of ctx.files) {
      if (file.language !== "java") continue;
      const root = rootOf(file.tree);
      for (const cls of findAll(root, (n) => n.type === "class_declaration")) {
        const name = cls.childForFieldName("name");
        if (!name) continue;
        const inherits: string[] = [];
        const sc = cls.childForFieldName("superclass");
        if (sc) {
          for (const id of sc.namedChildren) {
            if (id.type === "type_identifier") inherits.push(id.text);
          }
        }
        const body = cls.childForFieldName("body");
        const methods: string[] = [];
        const fields: Field[] = [];
        if (body) {
          for (const m of body.namedChildren) {
            if (m.type === "method_declaration") {
              const n = m.childForFieldName("name");
              if (n) methods.push(n.text);
            }
            if (m.type === "field_declaration") {
              const t = m.childForFieldName("type");
              for (const v of m.namedChildren) {
                if (v.type === "variable_declarator") {
                  const vn = v.childForFieldName("name");
                  if (vn) fields.push({ name: vn.text, type: t ? t.text : null });
                }
              }
            }
          }
        }
        if (methods.length < 2 && inherits.length === 0) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
        entities.push({
          name: name.text,
          source,
          inherits,
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
