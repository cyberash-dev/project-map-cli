import { createHash } from "node:crypto";
import type { DetectionFact } from "../../../core/domain/facts/fact.js";
import { semanticCore } from "../merge/core.js";
import { jcs } from "./jcs.js";

export type FactIdRequest = {
	readonly fact: DetectionFact;
	readonly schemaVersion: string;
	readonly repositoryIdentity: string;
};

/**
 * Computed after merge, over the semantic core alone. Two repositories that
 * expose the same route still produce different ids, because the identity of
 * the emitting repository is part of the preimage.
 */
export function factId(request: FactIdRequest): string {
	const preimage = jcs([
		request.schemaVersion,
		request.repositoryIdentity,
		request.fact.kind,
		semanticCore(request.fact),
	]);
	const digest = createHash("sha256").update(preimage, "utf8").digest("hex");
	return `sha256:${digest}`;
}
