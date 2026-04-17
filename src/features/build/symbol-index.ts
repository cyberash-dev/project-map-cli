import type { Language } from "../../core/domain/language.js";
import type { ParsedFile } from "../../core/ports/parser.port.js";
import {
  findAll,
  rootOf,
  type SyntaxNode,
} from "../../infrastructure/parser/ts-utils.js";
import type { SymbolIndex, VariableBinding } from "./extraction-context.js";

export function buildSymbolIndex(files: readonly ParsedFile[], language: Language): SymbolIndex {
  const defs = new Map<string, Array<{ file: string; line: number }>>();
  const importsByFile = new Map<string, string[]>();
  const variables = new Map<string, VariableBinding[]>();

  for (const file of files) {
    if (file.language !== language) continue;
    const root = rootOf(file.tree);
    for (const def of collectDefNames(root, language)) {
      const arr = defs.get(def.name) ?? [];
      arr.push({ file: file.relPath, line: def.line });
      defs.set(def.name, arr);
    }
    const imports = collectImports(root, language);
    importsByFile.set(file.relPath, imports);
    for (const v of collectVariableBindings(root, language)) {
      const arr = variables.get(v.name) ?? [];
      arr.push({ file: file.relPath, line: v.line, factory: v.factory });
      variables.set(v.name, arr);
    }
  }

  const inbound = new Map<string, number>();
  for (const imports of importsByFile.values()) {
    for (const imp of imports) {
      inbound.set(imp, (inbound.get(imp) ?? 0) + 1);
    }
  }
  return { defs, inbound, importsByFile, variables };
}

function collectDefNames(
  root: SyntaxNode,
  language: Language,
): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  const push = (nameNode: SyntaxNode | null | undefined) => {
    if (!nameNode) return;
    out.push({ name: nameNode.text, line: nameNode.startPosition.row + 1 });
  };
  switch (language) {
    case "python":
      for (const n of findAll(root, (x) => x.type === "class_definition" || x.type === "function_definition")) {
        push(n.childForFieldName("name"));
      }
      break;
    case "typescript":
    case "javascript":
      for (const n of findAll(root, (x) => x.type === "class_declaration" || x.type === "function_declaration" || x.type === "interface_declaration" || x.type === "enum_declaration")) {
        push(n.childForFieldName("name"));
      }
      break;
    case "go":
      for (const n of findAll(root, (x) => x.type === "type_declaration" || x.type === "function_declaration")) {
        if (n.type === "function_declaration") push(n.childForFieldName("name"));
        else {
          for (const spec of n.namedChildren) {
            if (spec.type === "type_spec") push(spec.childForFieldName("name"));
          }
        }
      }
      break;
    case "java":
      for (const n of findAll(root, (x) => x.type === "class_declaration" || x.type === "interface_declaration" || x.type === "enum_declaration")) {
        push(n.childForFieldName("name"));
      }
      break;
    case "kotlin":
      for (const n of findAll(root, (x) => x.type === "class_declaration" || x.type === "function_declaration")) {
        for (const c of n.namedChildren) {
          if (c.type === "simple_identifier" || c.type === "identifier") {
            out.push({ name: c.text, line: c.startPosition.row + 1 });
            break;
          }
        }
      }
      break;
  }
  return out;
}

function collectVariableBindings(
  root: SyntaxNode,
  language: Language,
): Array<{ name: string; line: number; factory: string }> {
  const out: Array<{ name: string; line: number; factory: string }> = [];
  if (language !== "typescript" && language !== "javascript") return out;

  for (const decl of findAll(root, (x) => x.type === "variable_declarator")) {
    const nameNode = decl.childForFieldName("name");
    if (!nameNode || nameNode.type !== "identifier") continue;
    const init = decl.childForFieldName("value");
    if (!init) continue;
    const factory = factoryOf(init);
    if (factory === null) continue;
    out.push({
      name: nameNode.text,
      line: nameNode.startPosition.row + 1,
      factory,
    });
  }
  return out;
}

function factoryOf(init: SyntaxNode): string | null {
  if (init.type === "call_expression") {
    const fn = init.childForFieldName("function");
    if (!fn) return null;
    if (fn.type === "identifier") return fn.text;
    if (fn.type === "member_expression") {
      const obj = fn.childForFieldName("object");
      const prop = fn.childForFieldName("property");
      if (obj && prop) return `${obj.text}.${prop.text}`;
    }
    return null;
  }
  if (init.type === "new_expression") {
    const ctor = init.childForFieldName("constructor");
    if (ctor && (ctor.type === "identifier" || ctor.type === "member_expression")) {
      return `new ${ctor.text}`;
    }
    return null;
  }
  return null;
}

function collectImports(root: SyntaxNode, language: Language): string[] {
  const out = new Set<string>();
  switch (language) {
    case "python":
      for (const imp of findAll(root, (x) => x.type === "import_from_statement" || x.type === "import_statement")) {
        for (const c of imp.namedChildren) {
          if (c.type === "dotted_name") {
            const last = c.text.split(".").pop();
            if (last) out.add(last);
          }
          if (c.type === "aliased_import") {
            for (const sub of c.namedChildren) {
              if (sub.type === "dotted_name" || sub.type === "identifier") out.add(sub.text);
            }
          }
          if (c.type === "import_list") {
            for (const el of c.namedChildren) {
              if (el.type === "dotted_name" || el.type === "identifier") out.add(el.text);
            }
          }
        }
      }
      break;
    case "typescript":
    case "javascript":
      for (const imp of findAll(root, (x) => x.type === "import_statement")) {
        for (const c of findAll(imp, (x) => x.type === "import_specifier" || x.type === "identifier")) {
          if (c.type === "identifier") out.add(c.text);
          else {
            const n = c.childForFieldName("name");
            if (n) out.add(n.text);
          }
        }
      }
      break;
    case "go":
      break;
    case "java":
      for (const imp of findAll(root, (x) => x.type === "import_declaration")) {
        const txt = imp.text.replace(/;.*$/, "").replace(/^import\s+/, "").trim();
        const last = txt.split(".").pop();
        if (last) out.add(last);
      }
      break;
    case "kotlin":
      for (const imp of findAll(root, (x) => x.type === "import_header")) {
        const txt = imp.text.trim();
        const last = txt.split(".").pop();
        if (last) out.add(last);
      }
      break;
  }
  return [...out];
}
