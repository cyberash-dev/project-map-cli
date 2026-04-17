import type {
  Endpoint,
  HttpMethod,
  SourceLocation,
} from "../../../../../core/domain/project-map.js";
import type { Framework } from "../../../../../core/domain/language.js";
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

export class PythonEndpointsAdapter implements ILanguageAdapter<Endpoint[]> {
  readonly language = "python" as const;

  async extract(ctx: ExtractionContext): Promise<Endpoint[]> {
    const frameworks = new Set<Framework>(ctx.config.project.frameworks);
    const explicit = ctx.config.endpoints.framework;
    if (explicit) frameworks.add(explicit);

    const endpoints: Endpoint[] = [];
    for (const file of ctx.files) {
      if (file.language !== "python") continue;
      if (frameworks.has("aiohttp") || explicit === "aiohttp") {
        endpoints.push(...extractAiohttp(file));
      }
      if (frameworks.has("fastapi") || explicit === "fastapi") {
        endpoints.push(...extractFastapi(file));
      }
      if (frameworks.has("flask") || explicit === "flask") {
        endpoints.push(...extractFlask(file));
      }
    }
    return endpoints;
  }
}

function extractAiohttp(file: { relPath: string; tree: unknown }): Endpoint[] {
  const root = rootOf(file.tree);
  const endpoints: Endpoint[] = [];
  for (const call of findAll(root, (n) => n.type === "call")) {
    const fn = call.childForFieldName("function");
    if (!fn) continue;
    const fnText = fn.text;
    const args = call.childForFieldName("arguments");
    if (!args) continue;

    if (/\.add_route$/.test(fnText) || /\.router\.add_route$/.test(fnText)) {
      const positional = positionalArgs(args);
      const method = stringLiteral(positional[0]);
      const pathArg = stringLiteral(positional[1]);
      const handler = positional[2] ? positional[2].text : null;
      if (method && pathArg && handler) {
        const m = method.toUpperCase();
        if (isHttpMethod(m)) {
          const src: SourceLocation = { file: file.relPath, line: line1Based(call) };
          endpoints.push({ method: m, path: pathArg, handler, source: src });
        }
      }
      continue;
    }
    const match = /\.add_(get|post|put|patch|delete|head|options)$/.exec(fnText);
    if (match) {
      const positional = positionalArgs(args);
      const pathArg = stringLiteral(positional[0]);
      const handler = positional[1] ? positional[1].text : null;
      if (pathArg && handler) {
        const m = (match[1] ?? "").toUpperCase();
        if (isHttpMethod(m)) {
          const src: SourceLocation = { file: file.relPath, line: line1Based(call) };
          endpoints.push({ method: m, path: pathArg, handler, source: src });
        }
      }
    }
  }
  return endpoints;
}

function extractFastapi(file: { relPath: string; tree: unknown }): Endpoint[] {
  const root = rootOf(file.tree);
  const endpoints: Endpoint[] = [];
  for (const dec of findAll(root, (n) => n.type === "decorated_definition")) {
    const decorators = dec.namedChildren.filter((c) => c.type === "decorator");
    for (const d of decorators) {
      const inner = d.namedChildren[0];
      if (!inner || inner.type !== "call") continue;
      const fn = inner.childForFieldName("function");
      if (!fn) continue;
      const text_ = fn.text;
      const m = /\.(get|post|put|patch|delete|head|options)$/.exec(text_);
      if (!m) continue;
      const args = inner.childForFieldName("arguments");
      if (!args) continue;
      const positional = positionalArgs(args);
      const pathArg = stringLiteral(positional[0]);
      if (!pathArg) continue;
      const fnDef = dec.namedChildren.find((c) => c.type === "function_definition");
      const handler = fnDef ? fnDef.childForFieldName("name")?.text ?? "<anonymous>" : "<anonymous>";
      const method = (m[1] ?? "").toUpperCase();
      if (!isHttpMethod(method)) continue;
      const src: SourceLocation = { file: file.relPath, line: line1Based(inner) };
      endpoints.push({ method, path: pathArg, handler, source: src });
    }
  }
  return endpoints;
}

function extractFlask(file: { relPath: string; tree: unknown }): Endpoint[] {
  const root = rootOf(file.tree);
  const endpoints: Endpoint[] = [];
  for (const dec of findAll(root, (n) => n.type === "decorated_definition")) {
    for (const d of dec.namedChildren.filter((c) => c.type === "decorator")) {
      const inner = d.namedChildren[0];
      if (!inner || inner.type !== "call") continue;
      const fn = inner.childForFieldName("function");
      if (!fn) continue;
      if (!/\.route$/.test(fn.text)) continue;
      const args = inner.childForFieldName("arguments");
      if (!args) continue;
      const positional = positionalArgs(args);
      const pathArg = stringLiteral(positional[0]);
      if (!pathArg) continue;
      const methodsKwargList = extractMethodsKwarg(args);
      const methods = methodsKwargList.length > 0 ? methodsKwargList : ["GET"];
      const fnDef = dec.namedChildren.find((c) => c.type === "function_definition");
      const handler = fnDef ? fnDef.childForFieldName("name")?.text ?? "<anonymous>" : "<anonymous>";
      const src: SourceLocation = { file: file.relPath, line: line1Based(inner) };
      for (const m of methods) {
        if (isHttpMethod(m)) {
          endpoints.push({ method: m, path: pathArg, handler, source: src });
        }
      }
    }
  }
  return endpoints;
}

function extractMethodsKwarg(args: SyntaxNode): HttpMethod[] {
  for (const arg of args.namedChildren) {
    if (arg.type !== "keyword_argument") continue;
    const name = arg.childForFieldName("name");
    if (!name || name.text !== "methods") continue;
    const value = arg.childForFieldName("value");
    if (!value) continue;
    if (value.type === "list" || value.type === "tuple" || value.type === "set") {
      const result: HttpMethod[] = [];
      for (const el of value.namedChildren) {
        const s = stringLiteral(el);
        if (s && isHttpMethod(s.toUpperCase())) result.push(s.toUpperCase() as HttpMethod);
      }
      return result;
    }
  }
  return [];
}

function positionalArgs(args: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (const arg of args.namedChildren) {
    if (arg.type === "keyword_argument") continue;
    if (arg.type === "list_splat" || arg.type === "dictionary_splat") continue;
    result.push(arg);
  }
  return result;
}

function stringLiteral(node: SyntaxNode | undefined): string | null {
  if (!node) return null;
  if (node.type !== "string") return null;
  const raw = node.text;
  return raw.replace(/^["'](.*)["']$/s, "$1");
}

function isHttpMethod(s: string): s is HttpMethod {
  return HTTP_METHODS.has(s.toLowerCase());
}
