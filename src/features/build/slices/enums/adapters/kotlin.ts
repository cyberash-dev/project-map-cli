import type { EnumType, SourceLocation } from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class KotlinEnumsAdapter implements ILanguageAdapter<EnumType[]> {
  readonly language = "kotlin" as const;

  async extract(ctx: ExtractionContext): Promise<EnumType[]> {
    const enums: EnumType[] = [];
    for (const file of ctx.files) {
      if (file.language !== "kotlin") continue;
      const root = rootOf(file.tree);
      for (const cls of findAll(root, (n) => n.type === "class_declaration")) {
        if (!hasEnumModifier(cls)) continue;
        const name = firstIdentifier(cls);
        if (!name) continue;
        const members: string[] = [];
        const body = findClassBody(cls);
        if (body) {
          for (const m of body.namedChildren) {
            if (m.type === "enum_class_body" || m.type === "enum_entries") {
              for (const entry of m.namedChildren) {
                if (entry.type === "enum_entry") {
                  const n = firstIdentifier(entry);
                  if (n) members.push(n.text);
                }
              }
            }
            if (m.type === "enum_entry") {
              const n = firstIdentifier(m);
              if (n) members.push(n.text);
            }
          }
        }
        if (members.length === 0) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
        enums.push({ name: name.text, source, members });
      }
    }
    enums.sort((a, b) => a.name.localeCompare(b.name));
    return enums;
  }
}

function hasEnumModifier(cls: SyntaxNode): boolean {
  for (const c of cls.namedChildren) {
    if (c.type === "modifiers" && c.text.includes("enum")) return true;
  }
  return false;
}

function firstIdentifier(node: SyntaxNode): SyntaxNode | null {
  for (const c of node.namedChildren) {
    if (c.type === "simple_identifier" || c.type === "identifier") return c;
  }
  return null;
}

function findClassBody(cls: SyntaxNode): SyntaxNode | null {
  for (const c of cls.namedChildren) {
    if (c.type === "class_body" || c.type === "enum_class_body") return c;
  }
  return null;
}
