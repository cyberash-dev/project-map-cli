import type { Endpoint } from "../../../../../core/domain/project-map.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";

export class KotlinEndpointsAdapter implements ILanguageAdapter<Endpoint[]> {
	readonly language = "kotlin" as const;

	extract(): Promise<Endpoint[]> {
		return Promise.resolve([]);
	}
}
