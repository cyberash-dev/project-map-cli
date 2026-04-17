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

type SpringMappingDecorator = {
  readonly annotation: string;
  readonly method: HttpMethod | "ANY";
};

const MAPPINGS: ReadonlyArray<SpringMappingDecorator> = [
  { annotation: "GetMapping", method: "GET" },
  { annotation: "PostMapping", method: "POST" },
  { annotation: "PutMapping", method: "PUT" },
  { annotation: "PatchMapping", method: "PATCH" },
  { annotation: "DeleteMapping", method: "DELETE" },
  { annotation: "RequestMapping", method: "ANY" },
];

export class JavaEndpointsAdapter implements ILanguageAdapter<Endpoint[]> {
  readonly language = "java" as const;

  async extract(ctx: ExtractionContext): Promise<Endpoint[]> {
    const endpoints: Endpoint[] = [];
    for (const file of ctx.files) {
      if (file.language !== "java") continue;
      const root = rootOf(file.tree);
      const annotations = findAll(root, (n) => n.type === "annotation" || n.type === "marker_annotation");
      for (const ann of annotations) {
        const nameNode = ann.childForFieldName("name");
        if (!nameNode) continue;
        const annName = nameNode.text;
        const spec = MAPPINGS.find((m) => m.annotation === annName);
        if (!spec) continue;
        const pathValue = extractAnnotationPath(ann);
        if (!pathValue) continue;
        const methodDef = findEnclosingMethod(ann);
        const handler = methodDef
          ? methodDef.childForFieldName("name")?.text ?? "<anonymous>"
          : "<anonymous>";
        const method = spec.method === "ANY" ? "GET" : spec.method;
        const source: SourceLocation = { file: file.relPath, line: line1Based(ann) };
        endpoints.push({ method, path: pathValue, handler, source });
      }
    }
    return endpoints;
  }
}

function extractAnnotationPath(ann: SyntaxNode): string | null {
  const argList = ann.childForFieldName("arguments");
  if (!argList) return null;
  for (const arg of argList.namedChildren) {
    if (arg.type === "string_literal" || arg.type === "string") {
      return arg.text.replace(/^"(.*)"$/s, "$1");
    }
    if (arg.type === "element_value_pair") {
      const key = arg.childForFieldName("key");
      const value = arg.childForFieldName("value");
      if (!key || !value) continue;
      if (key.text === "value" || key.text === "path") {
        if (value.type === "string_literal") {
          return value.text.replace(/^"(.*)"$/s, "$1");
        }
      }
    }
  }
  return null;
}

function findEnclosingMethod(node: SyntaxNode): SyntaxNode | null {
  let cur: SyntaxNode | null | undefined = node.parent;
  while (cur) {
    if (cur.type === "method_declaration") return cur;
    cur = cur.parent;
  }
  return null;
}
