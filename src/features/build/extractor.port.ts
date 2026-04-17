import type { Language } from "../../core/domain/language.js";
import type { ExtractionContext } from "./extraction-context.js";

export interface IExtractor<TResult> {
  readonly name: string;
  extract(ctx: ExtractionContext): Promise<TResult>;
}

export interface ILanguageAdapter<TResult> {
  readonly language: Language;
  extract(ctx: ExtractionContext): Promise<TResult>;
}

export class LanguageDispatchExtractor<TResult> implements IExtractor<TResult[]> {
  private readonly byLanguage: ReadonlyMap<Language, ILanguageAdapter<TResult[]>>;

  constructor(
    public readonly name: string,
    adapters: readonly ILanguageAdapter<TResult[]>[],
    private readonly empty: TResult[] = [],
  ) {
    const map = new Map<Language, ILanguageAdapter<TResult[]>>();
    for (const adapter of adapters) map.set(adapter.language, adapter);
    this.byLanguage = map;
  }

  async extract(ctx: ExtractionContext): Promise<TResult[]> {
    const adapter = this.byLanguage.get(ctx.language);
    if (!adapter) {
      ctx.logger.debug(
        `extractor ${this.name}: no adapter for language ${ctx.language}; skipping`,
      );
      return this.empty;
    }
    return await adapter.extract(ctx);
  }
}
