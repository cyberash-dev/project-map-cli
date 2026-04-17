import type { EnumType, SourceLocation } from "../../../../../core/domain/project-map.js";
import { findAll, line1Based, rootOf } from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class JavaEnumsAdapter implements ILanguageAdapter<EnumType[]> {
  readonly language = "java" as const;

  async extract(ctx: ExtractionContext): Promise<EnumType[]> {
    const enums: EnumType[] = [];
    for (const file of ctx.files) {
      if (file.language !== "java") continue;
      const root = rootOf(file.tree);
      for (const en of findAll(root, (n) => n.type === "enum_declaration")) {
        const name = en.childForFieldName("name");
        if (!name) continue;
        const body = en.childForFieldName("body");
        const members: string[] = [];
        if (body) {
          for (const c of body.namedChildren) {
            if (c.type === "enum_constant") {
              const n = c.childForFieldName("name");
              if (n) members.push(n.text);
            }
          }
        }
        if (members.length === 0) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(en) };
        enums.push({ name: name.text, source, members });
      }
    }
    enums.sort((a, b) => a.name.localeCompare(b.name));
    return enums;
  }
}
