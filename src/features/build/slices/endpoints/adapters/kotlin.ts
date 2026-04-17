import type { Endpoint } from "../../../../../core/domain/project-map.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class KotlinEndpointsAdapter implements ILanguageAdapter<Endpoint[]> {
  readonly language = "kotlin" as const;

  async extract(_ctx: ExtractionContext): Promise<Endpoint[]> {
    return [];
  }
}
