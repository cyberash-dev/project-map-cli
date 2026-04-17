import type { Entity } from "../../../../core/domain/project-map.js";
import type { ILanguageAdapter } from "../../extractor.port.js";
import { LanguageDispatchExtractor } from "../../extractor.port.js";
import type { ExtractionContext } from "../../extraction-context.js";
import { GoEntitiesAdapter } from "./adapters/go.js";
import { JavaEntitiesAdapter } from "./adapters/java.js";
import { KotlinEntitiesAdapter } from "./adapters/kotlin.js";
import { PythonEntitiesAdapter } from "./adapters/python.js";
import { TypeScriptEntitiesAdapter } from "./adapters/typescript.js";

export class EntitiesExtractor extends LanguageDispatchExtractor<Entity> {
  constructor() {
    const adapters: ILanguageAdapter<Entity[]>[] = [
      new PythonEntitiesAdapter(),
      new TypeScriptEntitiesAdapter("typescript"),
      new TypeScriptEntitiesAdapter("javascript"),
      new GoEntitiesAdapter(),
      new JavaEntitiesAdapter(),
      new KotlinEntitiesAdapter(),
    ];
    super("entities", adapters, []);
  }

  override async extract(ctx: ExtractionContext): Promise<Entity[]> {
    const raw = await super.extract(ctx);
    const ranked = rankAndTrim(raw, ctx);
    return ranked;
  }
}

function rankAndTrim(entities: Entity[], ctx: ExtractionContext): Entity[] {
  const weights = ctx.config.entities.importance;
  const withImportance = entities.map((e) => {
    const inbound = ctx.symbols.inbound.get(e.name) ?? 0;
    const importance =
      weights.methodCount * e.methods.length +
      weights.fieldCount * e.fields.length +
      weights.inboundReferences * inbound;
    return { ...e, referencedFrom: inbound, importance };
  });
  withImportance.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.name.localeCompare(b.name);
  });
  return withImportance.slice(0, ctx.config.entities.topN);
}
