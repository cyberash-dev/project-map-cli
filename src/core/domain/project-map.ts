import type { Framework, Language } from "./language.js";

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
	readonly storage: {
		readonly tables: readonly Table[];
		readonly migrations: readonly Migration[];
	};
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

/**
 * The sections the reworked detection renders. `endpoints` and `interactions`
 * are the ids the prior extractors held: project-map:DLT-019 rebinds them
 * rather than leaving a repository two names for one thing.
 */
export const DETECTION_SECTION_IDS = [
	"endpoints",
	"interactions",
	"detection_coverage",
] as const;

export const SECTION_IDS = [
	...DEFAULT_SECTION_IDS,
	"detection_coverage",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];
export type DetectionSectionId = (typeof DETECTION_SECTION_IDS)[number];

export function isDetectionSection(id: SectionId): id is DetectionSectionId {
	return DETECTION_SECTION_IDS.some((known) => known === id);
}
