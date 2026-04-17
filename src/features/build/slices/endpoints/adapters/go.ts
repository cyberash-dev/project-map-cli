import type {
  Endpoint,
  HttpMethod,
  SourceLocation,
} from "../../../../../core/domain/project-map.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

const METHOD_NAMES: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export class GoEndpointsAdapter implements ILanguageAdapter<Endpoint[]> {
  readonly language = "go" as const;

  async extract(ctx: ExtractionContext): Promise<Endpoint[]> {
    const endpoints: Endpoint[] = [];
    for (const file of ctx.files) {
      if (file.language !== "go") continue;
      const root = rootOf(file.tree);
      for (const call of findAll(root, (n) => n.type === "call_expression")) {
        const fn = call.childForFieldName("function");
        if (!fn) continue;
        const fnName = methodPart(fn);
        if (!fnName) continue;
        const upper = fnName.toUpperCase();
        if (!METHOD_NAMES.has(upper)) {
          if (fnName !== "HandleFunc" && fnName !== "Handle") continue;
        }
        const args = call.childForFieldName("arguments");
        if (!args) continue;
        const argChildren = args.namedChildren;
        const first = argChildren[0];
        const second = argChildren[1];
        if (!first) continue;
        const pathValue = goStringLiteral(first);
        if (pathValue === null) continue;
        const handler = second ? second.text.replace(/\s+/g, " ").slice(0, 80) : "<handler>";
        const method = upper === "HANDLEFUNC" || upper === "HANDLE" ? "ANY" : upper;
        if (method === "ANY" || !isHttpMethod(method)) {
          continue;
        }
        const source: SourceLocation = { file: file.relPath, line: line1Based(call) };
        endpoints.push({ method, path: pathValue, handler, source });
      }
    }
    return endpoints;
  }
}

function methodPart(fn: SyntaxNode): string | null {
  if (fn.type === "selector_expression") {
    const field = fn.childForFieldName("field");
    return field ? field.text : null;
  }
  if (fn.type === "identifier") return fn.text;
  return null;
}

function goStringLiteral(node: SyntaxNode): string | null {
  if (node.type === "interpreted_string_literal" || node.type === "raw_string_literal") {
    return node.text.replace(/^["`](.*)["`]$/s, "$1");
  }
  return null;
}

function isHttpMethod(s: string): s is HttpMethod {
  return METHOD_NAMES.has(s);
}
