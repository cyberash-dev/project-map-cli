import type { Framework, Language } from "../domain/language.js";
import type { SectionId } from "../domain/project-map.js";

export type EntitiesConfig = {
  readonly topN: number;
  readonly includeFields: boolean;
  readonly includePrivateMethods: boolean;
  readonly importance: {
    readonly methodCount: number;
    readonly fieldCount: number;
    readonly inboundReferences: number;
  };
};

export type ContextsConfig = {
  readonly custom: ReadonlyArray<{ readonly path: string; readonly role: string }>;
  readonly minFiles: number;
  readonly depth: number;
  readonly knownRoles: Readonly<Record<string, string>>;
};

export type EnumsConfig = {
  readonly baseClasses: readonly string[];
};

export type EndpointsConfig = {
  readonly framework: Framework | null;
  readonly routesModule: string | null;
  readonly appVar: string | null;
};

export type StorageConfig = {
  readonly baseClass: string;
  readonly migrationsDir: string | null;
  readonly lastN: number;
};

export type InteractionsConfig = {
  readonly dir: string | null;
};

export type WorkersConfig = {
  readonly patterns: readonly string[];
};

export type OverviewConfig = {
  readonly path: string | null;
};

export type OutputConfig = {
  readonly markdown: string;
  readonly json: string | null;
};

export type ResolvedConfig = {
  readonly project: {
    readonly name: string;
    readonly language: Language;
    readonly frameworks: readonly Framework[];
  };
  readonly root: string;
  readonly respectGitignore: boolean;
  readonly exclude: readonly string[];
  readonly sections: readonly SectionId[];
  readonly overview: OverviewConfig;
  readonly contexts: ContextsConfig;
  readonly entities: EntitiesConfig;
  readonly enums: EnumsConfig;
  readonly endpoints: EndpointsConfig;
  readonly storage: StorageConfig;
  readonly interactions: InteractionsConfig;
  readonly workers: WorkersConfig;
  readonly output: OutputConfig;
  readonly configHash: string;
  readonly sourcePath: string | null;
};

export interface IConfigLoader {
  load(cwd: string, explicitPath: string | null): Promise<ResolvedConfig | null>;
  writeDefault(targetPath: string, language: Language, framework: Framework | null): Promise<void>;
}
