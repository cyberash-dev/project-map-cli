import type { BoundedContext } from "../../../../core/domain/project-map.js";
import type { IExtractor } from "../../extractor.port.js";
import type { ExtractionContext } from "../../extraction-context.js";

export class ContextsExtractor implements IExtractor<BoundedContext[]> {
  readonly name = "contexts";

  async extract(ctx: ExtractionContext): Promise<BoundedContext[]> {
    const { contexts: cfg } = ctx.config;
    const fileCountsByTopDir = new Map<string, number>();

    for (const file of ctx.files) {
      const parts = file.relPath.split("/");
      if (parts.length < 2) continue;
      const top = parts.slice(0, Math.min(2, parts.length - 1)).join("/");
      fileCountsByTopDir.set(top, (fileCountsByTopDir.get(top) ?? 0) + 1);
    }

    const customMap = new Map(cfg.custom.map((c) => [normalizePath(c.path), c.role]));

    const results: BoundedContext[] = [];
    for (const [dirPath, fileCount] of fileCountsByTopDir.entries()) {
      if (fileCount < cfg.minFiles && !customMap.has(dirPath)) continue;
      const role = customMap.get(dirPath) ?? roleFromKnown(dirPath, cfg.knownRoles) ?? "Unspecified";
      results.push({ path: dirPath, fileCount, role });
    }

    results.sort((a, b) => {
      if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
      return a.path.localeCompare(b.path);
    });
    return results;
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function roleFromKnown(
  dirPath: string,
  knownRoles: Readonly<Record<string, string>>,
): string | null {
  const parts = dirPath.split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i];
    if (candidate && knownRoles[candidate]) return knownRoles[candidate] ?? null;
  }
  return null;
}
