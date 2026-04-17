import type { Root } from "mdast";
import type { Endpoint } from "../../../../core/domain/project-map.js";
import { section, table } from "../../rendering/mdast-helpers.js";

export function renderEndpoints(endpoints: readonly Endpoint[]): Root["children"] {
  if (endpoints.length === 0) return [];
  const sorted = [...endpoints].sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });
  return [
    ...section("HTTP endpoints", 2),
    table(
      ["Method", "Path", "Handler", "Source"],
      sorted.map((e) => [
        e.method,
        e.path,
        e.handler,
        `${e.source.file}:${e.source.line}`,
      ]),
      ["left", "left", "left", "left"],
    ),
  ];
}
