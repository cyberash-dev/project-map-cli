import type { Framework, Language } from "./language.js";

export type HttpMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "HEAD"
	| "OPTIONS";

export type SourceLocation = {
	readonly file: string;
	readonly line: number;
};

export type Field = {
	readonly name: string;
	readonly type: string | null;
};

export type Entity = {
	readonly name: string;
	readonly source: SourceLocation;
	readonly inherits: readonly string[];
	readonly fields: readonly Field[];
	readonly methods: readonly string[];
	readonly referencedFrom: number;
	readonly importance: number;
};

export type EnumType = {
	readonly name: string;
	readonly source: SourceLocation;
	readonly members: readonly string[];
};

export type BoundedContext = {
	readonly path: string;
	readonly fileCount: number;
	readonly role: string;
};

export type Endpoint = {
	readonly method: HttpMethod;
	readonly path: string;
	readonly handler: string;
	readonly source: SourceLocation;
};

export type Table = {
	readonly table: string;
	readonly model: string;
	readonly source: SourceLocation;
};

export type Migration = {
	readonly revision: string;
	readonly downRevision: string | null;
	readonly tables: readonly string[];
	readonly summary: string;
	readonly source: SourceLocation;
};

export type Interaction = {
	readonly directory: string;
	readonly clientClass: string;
	readonly baseUrlFrom: string | null;
	readonly methods: readonly string[];
	readonly usedBy: readonly string[];
};

export type Worker = {
	readonly name: string;
	readonly source: SourceLocation;
	readonly subscribesTo: readonly string[];
	readonly handler: string | null;
};

export type ExtractionError = {
	readonly section: string;
	readonly message: string;
};

export type GenerationMetadata = {
	readonly toolVersion: string;
	readonly generatedAt: string;
	readonly revision: string | null;
	readonly configHash: string;
	readonly scannedFiles: number;
	readonly excludedFiles: number;
	readonly buildDurationMs: number;
	readonly language: Language;
	readonly frameworks: readonly Framework[];
	readonly overview: string | null;
	readonly errors: readonly ExtractionError[];
};

export type ProjectMap = {
	readonly metadata: GenerationMetadata;
	readonly project: {
		readonly name: string;
		readonly language: Language;
		readonly frameworks: readonly Framework[];
	};
	readonly contexts: readonly BoundedContext[];
	readonly entities: readonly Entity[];
	readonly enums: readonly EnumType[];
	readonly endpoints: readonly Endpoint[];
	readonly storage: {
		readonly tables: readonly Table[];
		readonly migrations: readonly Migration[];
	};
	readonly interactions: readonly Interaction[];
	readonly workers: readonly Worker[];
};

/**
 * The sections a repository renders unless it names others. The reworked
 * detection is not among them: a repository that changes no configuration must
 * see the document it saw before, because check mode compares it byte for byte.
 */
export const DEFAULT_SECTION_IDS = [
	"overview",
	"contexts",
	"entities",
	"enums",
	"endpoints",
	"storage",
	"interactions",
	"workers",
	"metadata",
] as const;

/** The opt-in sections the reworked detection renders under. */
export const DETECTION_SECTION_IDS = [
	"inbound_endpoints",
	"outbound_operations",
	"detection_coverage",
] as const;

export const SECTION_IDS = [
	...DEFAULT_SECTION_IDS,
	...DETECTION_SECTION_IDS,
] as const;

export type SectionId = (typeof SECTION_IDS)[number];
export type DetectionSectionId = (typeof DETECTION_SECTION_IDS)[number];

export function isDetectionSection(id: SectionId): id is DetectionSectionId {
	return DETECTION_SECTION_IDS.some((known) => known === id);
}
