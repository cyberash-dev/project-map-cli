import type { Diagnostic } from "../../../core/domain/facts/diagnostic.js";
import type { DetectionFact } from "../../../core/domain/facts/fact.js";
import { orderByCanonicalBytes } from "../canonical/array-order.js";
import { jcs } from "../canonical/jcs.js";

export const FACTS_SCHEMA_VERSION = "1";

export type ArtifactRequest = {
	readonly repositoryIdentity: string;
	readonly unitDigest: string;
	readonly analyzerBuildDigest: string;
	readonly registryDigest: string;
	readonly facts: readonly DetectionFact[];
	readonly diagnostics: readonly Diagnostic[];
	readonly coverage: Readonly<Record<string, string | number>>;
};

/**
 * The verifiable artifact. It carries no timestamp and no build duration, so
 * two runs over one analysis unit compare byte for byte with no normalization.
 */
export function renderFactsArtifact(request: ArtifactRequest): string {
	return `${jcs({
		schema_version: FACTS_SCHEMA_VERSION,
		repository_identity: request.repositoryIdentity,
		analysis_unit_digest: request.unitDigest,
		analyzer_build_digest: request.analyzerBuildDigest,
		adapter_registry_digest: request.registryDigest,
		coverage: request.coverage,
		facts: request.facts,
		diagnostics: orderByCanonicalBytes(request.diagnostics),
	})}\n`;
}

export type SidecarRequest = {
	readonly generatedAt: string;
	readonly buildDurationMs: number;
	readonly unitDigest: string;
};

/**
 * Everything check mode must not read. Kept in a separate file rather than a
 * separate section so that no comparison can reach it by accident.
 */
export function renderFactsSidecar(request: SidecarRequest): string {
	return `${JSON.stringify(
		{
			generated_at: request.generatedAt,
			build_duration_ms: request.buildDurationMs,
			analysis_unit_digest: request.unitDigest,
		},
		null,
		"\t",
	)}\n`;
}

export function sidecarPathFor(factsPath: string): string {
	const stem = factsPath.endsWith(".json")
		? factsPath.slice(0, -".json".length)
		: factsPath;
	return `${stem}.meta.json`;
}
