import type { ResolvedConfig } from "./config.port.js";

export type UnitSource = {
	readonly path: string;
	readonly text: string;
};

export type UnitDocument = {
	readonly locator: string;
	readonly text: string;
};

/**
 * The finite, content-addressed input whose digest fixes detection output.
 * It carries no absolute path, so a checkout at another location yields the
 * same digest and therefore the same artifact bytes.
 */
export type AnalysisUnit = {
	readonly repositoryIdentity: string;
	readonly sources: readonly UnitSource[];
	readonly configDocuments: readonly UnitDocument[];
	readonly specs: readonly UnitDocument[];
	readonly registryVersion: string;
	readonly digest: string;
};

export type MaterializeRequest = {
	readonly cwd: string;
	readonly config: ResolvedConfig;
	readonly specLocators: readonly string[];
	readonly registryVersion: string;
};

export interface IAnalysisUnitMaterializer {
	materialize(request: MaterializeRequest): Promise<AnalysisUnit>;
}
