import type {
	BoundedContext,
	Entity,
	EnumType,
	Worker,
} from "../../core/domain/project-map.js";
import type { IExtractor } from "./extractor.port.js";
import { ContextsExtractor } from "./slices/contexts/extract.js";
import { EntitiesExtractor } from "./slices/entities/extract.js";
import { EnumsExtractor } from "./slices/enums/extract.js";
import {
	StorageExtractor,
	type StorageResult,
} from "./slices/storage/extract.js";
import { WorkersExtractor } from "./slices/workers/extract.js";

export type ExtractorSet = {
	readonly contexts: IExtractor<BoundedContext[]>;
	readonly entities: IExtractor<Entity[]>;
	readonly enums: IExtractor<EnumType[]>;
	readonly storage: IExtractor<StorageResult>;
	readonly workers: IExtractor<Worker[]>;
};

export function defaultExtractors(): ExtractorSet {
	return {
		contexts: new ContextsExtractor(),
		entities: new EntitiesExtractor(),
		enums: new EnumsExtractor(),
		storage: new StorageExtractor(),
		workers: new WorkersExtractor(),
	};
}
