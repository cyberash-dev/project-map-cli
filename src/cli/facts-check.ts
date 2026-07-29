import { MANDATORY_CHECK_CODES } from "../core/domain/facts/diagnostic.js";
import type { FactSet } from "../features/detect/detect.use-case.js";

/**
 * The failure classes `build --check` distinguishes, in the precedence
 * project-map:BEH-006 declares. A fingerprint difference accounts for every
 * byte difference downstream of it, so it outranks drift rather than hiding
 * inside it.
 */
export type CheckOutcome =
	| { readonly code: 0 }
	| { readonly code: 1; readonly reason: string }
	| { readonly code: 3; readonly reason: string }
	| { readonly code: 4; readonly reason: string };

export type ArtifactCheck = {
	readonly committed: string | null;
	readonly built: string;
	readonly analyzerBuildDigest: string;
	readonly registryDigest: string;
	readonly factSet: FactSet;
};

export function checkFactsArtifact(check: ArtifactCheck): CheckOutcome {
	const mandatory = check.factSet.diagnostics.find((entry) =>
		MANDATORY_CHECK_CODES.has(entry.code),
	);
	if (mandatory !== undefined) {
		return { code: 4, reason: `mandatory check diagnostic: ${mandatory.code}` };
	}
	const drifted = check.committed !== check.built;
	const fingerprint = fingerprintMismatch(check);
	if (fingerprint !== null) {
		return { code: 3, reason: fingerprint };
	}
	if (check.committed === null) {
		return { code: 1, reason: "the facts artifact is absent" };
	}
	return drifted
		? { code: 1, reason: "the facts artifact is out of date" }
		: { code: 0 };
}

/**
 * Read off the committed bytes rather than the sidecar: check mode never opens
 * the sidecar, so a fingerprint it carried would be invisible here.
 */
function fingerprintMismatch(check: ArtifactCheck): string | null {
	if (check.committed === null) {
		return null;
	}
	const committed = parse(check.committed);
	if (committed === null) {
		return null;
	}
	if (committed.analyzer !== check.analyzerBuildDigest) {
		return "the committed artifact names another analyzer build";
	}
	if (committed.registry !== check.registryDigest) {
		return "the committed artifact names another adapter registry";
	}
	return null;
}

function parse(
	content: string,
): { readonly analyzer: string; readonly registry: string } | null {
	try {
		const document: unknown = JSON.parse(content);
		if (typeof document !== "object" || document === null) {
			return null;
		}
		const analyzer = readString(document, "analyzer_build_digest");
		const registry = readString(document, "adapter_registry_digest");
		return analyzer === null || registry === null
			? null
			: { analyzer, registry };
	} catch {
		return null;
	}
}

function readString(document: object, key: string): string | null {
	const found: unknown = Reflect.get(document, key);
	return typeof found === "string" ? found : null;
}
