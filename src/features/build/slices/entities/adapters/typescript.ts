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
      const seen = new Set<string>();

      for (const cls of classesIn(file)) {
        const name = classNameOf(cls);
        if (!name || name.startsWith("_") || name.length < 2) continue;
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
        seen.add(name);
      }

      for (const proto of prototypeEntitiesIn(file)) {
        if (seen.has(proto.name)) continue;
        entities.push(proto);
        seen.add(proto.name);
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

type ProtoGroup = { methods: Set<string>; bases: Set<string> };

function prototypeEntitiesIn(file: ParsedFile): Entity[] {
  const root = rootOf(file.tree);
  const funcDecls = new Map<string, SyntaxNode>();
  for (const fn of findAll(root, (n) => n.type === "function_declaration")) {
    const name = fn.childForFieldName("name");
    if (name) funcDecls.set(name.text, fn);
  }

  const groups = new Map<string, ProtoGroup>();
  const touch = (ctor: string): ProtoGroup => {
    let g = groups.get(ctor);
    if (!g) {
      g = { methods: new Set(), bases: new Set() };
      groups.set(ctor, g);
    }
    return g;
  };

  for (const assign of findAll(root, (n) => n.type === "assignment_expression")) {
    const lhs = assign.childForFieldName("left");
    const rhs = assign.childForFieldName("right");
    if (!lhs || !rhs) continue;
    if (lhs.type !== "member_expression") continue;

    const outerObj = lhs.childForFieldName("object");
    const outerProp = lhs.childForFieldName("property");
    if (!outerObj || !outerProp) continue;

    if (
      outerObj.type === "member_expression" &&
      outerObj.childForFieldName("property")?.text === "prototype"
    ) {
      const ctor = outerObj.childForFieldName("object");
      if (!ctor || ctor.type !== "identifier") continue;
      if (outerProp.text.startsWith("_")) continue;
      touch(ctor.text).methods.add(outerProp.text);
      continue;
    }

    if (outerObj.type === "identifier" && outerProp.text === "prototype") {
      const ctor = outerObj.text;
      const g = touch(ctor);
      const base = detectInheritance(rhs);
      if (base) g.bases.add(base);
      if (rhs.type === "object") {
        for (const pair of rhs.namedChildren) {
          if (pair.type !== "pair") continue;
          const key = pair.childForFieldName("key");
          if (key && !key.text.startsWith("_")) g.methods.add(key.text);
        }
      }
    }
  }

  const out: Entity[] = [];
  for (const [name, group] of groups) {
    if (name.startsWith("_") || name.length < 2) continue;
    const fn = funcDecls.get(name);
    if (!fn) continue;
    if (group.methods.size < 2 && group.bases.size === 0) continue;
    const source: SourceLocation = { file: file.relPath, line: line1Based(fn) };
    out.push({
      name,
      source,
      inherits: [...group.bases].sort(),
      fields: [],
      methods: [...group.methods].sort().slice(0, 8),
      referencedFrom: 0,
      importance: 0,
    });
  }
  return out;
}

function detectInheritance(rhs: SyntaxNode): string | null {
  if (rhs.type === "call_expression") {
    const fn = rhs.childForFieldName("function");
    if (
      fn &&
      fn.type === "member_expression" &&
      fn.childForFieldName("object")?.text === "Object" &&
      fn.childForFieldName("property")?.text === "create"
    ) {
      const args = rhs.childForFieldName("arguments");
      const first = args?.namedChildren[0];
      if (
        first &&
        first.type === "member_expression" &&
        first.childForFieldName("property")?.text === "prototype"
      ) {
        const parent = first.childForFieldName("object");
        if (parent && parent.type === "identifier") return parent.text;
      }
    }
  }
  if (rhs.type === "new_expression") {
    const ctor = rhs.childForFieldName("constructor");
    if (ctor && ctor.type === "identifier") return ctor.text;
  }
  if (rhs.type === "member_expression") {
    if (rhs.childForFieldName("property")?.text === "prototype") {
      const parent = rhs.childForFieldName("object");
      if (parent && parent.type === "identifier") return parent.text;
    }
  }
  return null;
}
