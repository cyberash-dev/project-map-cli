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
	readonly custom: ReadonlyArray<{
		readonly path: string;
		readonly role: string;
	}>;
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
	readonly facts: string | null;
};

/**
 * Bounds the content whose digest fixes detection output. Deliberately
 * decoupled from the top-level `exclude`, which is tuned for the map document
 * and routinely hides the declarations detection needs to prove a type.
 */
export type AnalysisUnitConfig = {
	readonly sources: {
		readonly include: readonly string[];
		readonly exclude: readonly string[];
	};
	readonly configDeclarations: readonly string[];
};

/** One hand-declared specification this repository serves. */
export type ServedContract = {
	readonly spec: string;
	readonly contractId: string;
	readonly mount: string | null;
};

export type ConsumedContract = {
	readonly generatedModule: string;
	readonly spec: string;
	readonly contractId: string;
};

export type OpenApiConfig = {
	readonly serves: readonly ServedContract[];
	readonly consumes: readonly ConsumedContract[];
};

export type SelectorStep =
	| { readonly kind: "arg"; readonly selector: number | string }
	| { readonly kind: "field"; readonly selector: string }
	| { readonly kind: "class_const"; readonly selector: string }
	| { readonly kind: "receiver" }
	| { readonly kind: "property-path"; readonly selector: string };

/** An ordered chain; step i+1 applies to the normalized value of step i. */
export type Selector = readonly SelectorStep[];

/**
 * The verb of a route registered through a declaration DSL comes from the
 * handler's own members. The handler itself is addressed by a selector, so the
 * adapter never has to assume which argument carries it.
 */
export type VerbSource = {
	readonly kind: "handler_methods";
	readonly handler: Selector;
};

/**
 * A member that hands its router identity on. `binds` additionally carries the
 * identity into the first parameter of the function literal passed as argument
 * zero, which is how a grouping closure keeps registering against its outer
 * router even where it shadows the name.
 */
export type IdentityPreserving = {
	readonly member: string;
	readonly from: "receiver" | "arg";
	readonly index: number | null;
	readonly binds: "closure_arg0_param0" | null;
};

export type DeclaredRouter = {
	readonly dsl: string;
	readonly pathArg: Selector;
	readonly prefixFrom: Selector | null;
	readonly verbFrom: VerbSource | null;
	readonly identityPreserving: readonly IdentityPreserving[];
};

export type DetectConfig = {
	readonly inbound: { readonly routers: readonly DeclaredRouter[] };
	readonly outbound: { readonly sinks: readonly unknown[] };
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
	readonly repositoryIdentity: string | null;
	readonly analysisUnit: AnalysisUnitConfig;
	readonly openapi: OpenApiConfig;
	readonly detect: DetectConfig;
	readonly configHash: string;
	readonly sourcePath: string | null;
};

export interface IConfigLoader {
	load(
		cwd: string,
		explicitPath: string | null,
	): Promise<ResolvedConfig | null>;
	writeDefault(
		targetPath: string,
		language: Language,
		framework: Framework | null,
	): Promise<void>;
}
