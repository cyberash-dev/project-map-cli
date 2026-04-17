import type { SourceLocation, Worker } from "../../../../../core/domain/project-map.js";
import {
  childText,
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";

export async function extractPythonWorkers(ctx: ExtractionContext): Promise<Worker[]> {
  const classNamePatterns: RegExp[] = [];
  const decoratorPatterns: string[] = [];
  for (const raw of ctx.config.workers.patterns) {
    const classMatch = /^class\s+(.+)$/.exec(raw.trim());
    if (classMatch?.[1]) {
      const glob = classMatch[1].trim();
      classNamePatterns.push(globToRegex(glob));
      continue;
    }
    const decoratorMatch = /^@(.+)$/.exec(raw.trim());
    if (decoratorMatch?.[1]) {
      decoratorPatterns.push(decoratorMatch[1].trim());
      continue;
    }
  }

  const workers: Worker[] = [];
  for (const file of ctx.files) {
    if (file.language !== "python") continue;
    const root = rootOf(file.tree);

    for (const cls of findAll(root, (n) => n.type === "class_definition")) {
      const name = childText(cls, "name");
      if (!name) continue;
      if (!classNamePatterns.some((r) => r.test(name))) continue;
      const handler = readActionClass(cls);
      const subscribesTo = readSubscriptions(cls);
      const source: SourceLocation = { file: file.relPath, line: line1Based(cls) };
      workers.push({ name, source, subscribesTo, handler });
    }

    for (const dec of findAll(root, (n) => n.type === "decorated_definition")) {
      for (const d of dec.namedChildren.filter((c) => c.type === "decorator")) {
        const callOrAttr = d.namedChildren[0];
        if (!callOrAttr) continue;
        const text =
          callOrAttr.type === "call"
            ? callOrAttr.childForFieldName("function")?.text ?? ""
            : callOrAttr.text;
        if (!decoratorPatterns.some((p) => text === p || text.endsWith(`.${p}`))) continue;
        const fn = dec.namedChildren.find((c) => c.type === "function_definition");
        if (!fn) continue;
        const name = childText(fn, "name");
        if (!name) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(dec) };
        workers.push({ name, source, subscribesTo: [], handler: null });
      }
    }
  }

  workers.sort((a, b) => a.name.localeCompare(b.name));
  return workers;
}

function readActionClass(cls: SyntaxNode): string | null {
  const body = cls.childForFieldName("body");
  if (!body) return null;
  for (const stmt of body.namedChildren) {
    if (stmt.type !== "expression_statement") continue;
    const inner = stmt.namedChildren[0];
    if (!inner || inner.type !== "assignment") continue;
    const left = inner.childForFieldName("left");
    const right = inner.childForFieldName("right");
    if (!left || !right) continue;
    if (left.text === "action_class" || left.text === "handler_class") {
      return right.text;
    }
  }
  return null;
}

function readSubscriptions(cls: SyntaxNode): string[] {
  const results = new Set<string>();
  for (const node of findAll(cls, (n) => n.type === "identifier")) {
    if (/^EVENT_TYPE_[A-Z_][A-Z0-9_]*$/.test(node.text)) results.add(node.text);
  }
  return [...results].sort();
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
