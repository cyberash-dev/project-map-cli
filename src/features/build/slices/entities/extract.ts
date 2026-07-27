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
	/*
	 * Ties fall through to the source anchor so the order is a declared
	 * total order (project-map:INV-002) rather than one that holds only
	 * because the walker happens to emit sorted paths.
	 */
	withImportance.sort((a, b) => {
		if (b.importance !== a.importance) {
			return b.importance - a.importance;
		}
		const byName = a.name.localeCompare(b.name);
		if (byName !== 0) {
			return byName;
		}
		const byFile = a.source.file.localeCompare(b.source.file);
		return byFile !== 0 ? byFile : a.source.line - b.source.line;
	});
	return withImportance.slice(0, ctx.config.entities.topN);
}
