import type { Worker } from "../../../../core/domain/project-map.js";
import type { IExtractor } from "../../extractor.port.js";
import type { ExtractionContext } from "../../extraction-context.js";
import { extractPythonWorkers } from "./adapters/python.js";
import { extractTypeScriptWorkers } from "./adapters/typescript.js";

export class WorkersExtractor implements IExtractor<Worker[]> {
  readonly name = "workers";

  async extract(ctx: ExtractionContext): Promise<Worker[]> {
    switch (ctx.language) {
      case "python":
        return await extractPythonWorkers(ctx);
      case "typescript":
      case "javascript":
        return await extractTypeScriptWorkers(ctx);
      default:
        return [];
    }
  }
}
