import type { EnumType, SourceLocation } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class GoEnumsAdapter implements ILanguageAdapter<EnumType[]> {
  readonly language = "go" as const;

  async extract(ctx: ExtractionContext): Promise<EnumType[]> {
    const enums: EnumType[] = [];
    for (const file of ctx.files) {
      if (file.language !== "go") continue;
      const root = rootOf(file.tree);
      for (const cd of findAll(root, (n) => n.type === "const_declaration")) {
        const specs = cd.namedChildren.filter((c) => c.type === "const_spec");
        if (specs.length < 2) continue;
        const members: string[] = [];
        let typeName: string | null = null;
        for (const spec of specs) {
          const t = spec.childForFieldName("type");
          if (t && !typeName) typeName = t.text;
          const name = spec.childForFieldName("name");
          if (name) members.push(name.text);
        }
        if (!typeName || members.length === 0) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(cd) };
        enums.push({ name: typeName, source, members });
      }
    }
    enums.sort((a, b) => a.name.localeCompare(b.name));
    return enums;
  }
}
