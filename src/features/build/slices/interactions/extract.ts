import type { Interaction } from "../../../../core/domain/project-map.js";
import type { IExtractor } from "../../extractor.port.js";
import type { ExtractionContext } from "../../extraction-context.js";
import { extractPythonInteractions } from "./adapters/python.js";
import { extractTypeScriptInteractions } from "./adapters/typescript.js";

export class InteractionsExtractor implements IExtractor<Interaction[]> {
  readonly name = "interactions";

  async extract(ctx: ExtractionContext): Promise<Interaction[]> {
    if (!ctx.config.interactions.dir) return [];
    switch (ctx.language) {
      case "python":
        return await extractPythonInteractions(ctx);
      case "typescript":
      case "javascript":
        return await extractTypeScriptInteractions(ctx);
      default:
        return [];
    }
  }
}
