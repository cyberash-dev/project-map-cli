import type {
  Endpoint,
  HttpMethod,
  SourceLocation,
} from "../../../../../core/domain/project-map.js";
import type { Language } from "../../../../../core/domain/language.js";
import {
  findAll,
  line1Based,
  rootOf,
  type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

const HTTP_METHODS: ReadonlySet<string> = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

export class TypeScriptEndpointsAdapter implements ILanguageAdapter<Endpoint[]> {
  constructor(public readonly language: Language) {}

  async extract(ctx: ExtractionContext): Promise<Endpoint[]> {
    const endpoints: Endpoint[] = [];
    for (const file of ctx.files) {
      if (file.language !== this.language) continue;
      const root = rootOf(file.tree);
      for (const call of findAll(root, (n) => n.type === "call_expression")) {
        const fn = call.childForFieldName("function");
        if (!fn) continue;
        if (fn.type !== "member_expression") continue;
        const prop = fn.childForFieldName("property");
        if (!prop) continue;
        const name = prop.text.toLowerCase();
        if (!HTTP_METHODS.has(name)) continue;
        const args = call.childForFieldName("arguments");
        if (!args) continue;
        const positional = args.namedChildren;
        const first = positional[0];
        if (!first) continue;
        const pathValue = jsStringLiteral(first);
        if (pathValue === null) continue;
        const handlerNode = positional[positional.length - 1];
        const handler = handlerNode ? handlerNode.text.replace(/\s+/g, " ").slice(0, 80) : "<handler>";
        const method = name.toUpperCase();
        if (!isHttpMethod(method)) continue;
        const source: SourceLocation = { file: file.relPath, line: line1Based(call) };
        endpoints.push({ method, path: pathValue, handler, source });
      }
    }
    return endpoints;
  }
}

function jsStringLiteral(node: SyntaxNode): string | null {
  if (node.type === "string" || node.type === "template_string") {
    return node.text.replace(/^[`'"](.*)[`'"]$/s, "$1");
  }
  return null;
}

function isHttpMethod(s: string): s is HttpMethod {
  return HTTP_METHODS.has(s.toLowerCase());
}
