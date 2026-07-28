import type { Evidence } from "../../../core/domain/facts/anchor.js";
import type { Diagnostic } from "../../../core/domain/facts/diagnostic.js";
import type { EndpointFact } from "../../../core/domain/facts/fact.js";
import type {
	AnalysisUnit,
	UnitDocument,
} from "../../../core/ports/analysis-unit.port.js";
import type { ServedContract } from "../../../core/ports/config.port.js";
import type {
	IOpenApiReader,
	SpecOperation,
} from "../../../core/ports/openapi.port.js";
import {
	type DraftEndpointFact,
	finalizeEndpointFacts,
} from "../merge/merge-table.js";
import { deriveResolution } from "../merge/resolution.js";
import { canonicalPath } from "./path-grammar.js";

export type IngestRequest = {
	readonly unit: AnalysisUnit;
	readonly serves: readonly ServedContract[];
	readonly reader: IOpenApiReader;
	readonly schemaVersion: string;
};

export type IngestResult = {
	readonly drafts: readonly DraftEndpointFact[];
	readonly facts: readonly EndpointFact[];
	readonly diagnostics: readonly Diagnostic[];
};

/**
 * Stage one of detection: the declared inventory. It runs over the served
 * specifications alone and never consults the code, so a route disappears
 * from it only when the specification stops declaring it.
 */
export function ingestServedContracts(request: IngestRequest): IngestResult {
	const drafts: DraftEndpointFact[] = [];
	const diagnostics: Diagnostic[] = [];

	for (const entry of request.serves) {
		const document = request.unit.specs.find(
			(spec) => spec.locator === entry.spec,
		);
		if (document === undefined) {
			diagnostics.push(unreadableDiagnostic(entry.spec));
			continue;
		}
		const parsed = request.reader.read(document);
		if (parsed.kind === "unreadable") {
			diagnostics.push(unreadableDiagnostic(entry.spec));
			continue;
		}
		for (const operation of parsed.operations) {
			drafts.push(
				draftFor({
					operation,
					entry,
					basePath: parsed.basePath,
					document,
				}),
			);
		}
	}

	const facts = finalizeEndpointFacts({
		drafts,
		schemaVersion: request.schemaVersion,
		repositoryIdentity: request.unit.repositoryIdentity,
	});
	return {
		drafts,
		facts,
		diagnostics: [...diagnostics, ...notInCodeDiagnostics(facts)],
	};
}

type DraftRequest = {
	readonly operation: SpecOperation;
	readonly entry: ServedContract;
	readonly basePath: string;
	readonly document: UnitDocument;
};

function draftFor(request: DraftRequest): DraftEndpointFact {
	const path = canonicalPath([
		request.entry.mount ?? "",
		request.basePath,
		request.operation.path,
	]);
	const operation = {
		variants: [
			{
				http: {
					method: { kind: "literal", value: request.operation.method } as const,
					path: { kind: "literal", value: path } as const,
				},
			},
		],
	};
	return {
		kind: "endpoint",
		mechanism: "http",
		operation,
		/* No code is scanned in this stage, so no handler can be proven here. */
		handler: { kind: "unknown", reason: "operation_mapping_unresolved" },
		contract_refs: [
			{
				contract_id: request.entry.contractId,
				operation_id:
					request.operation.operationId ??
					`${request.operation.method} ${path}`,
			},
		],
		provenance: ["openapi"],
		resolution: deriveResolution({ operation, requiresDestination: false }),
		evidence: [documentEvidence(request.document)],
	};
}

function documentEvidence(document: UnitDocument): Evidence {
	return {
		path: document.locator,
		start_byte: 0,
		end_byte: Buffer.byteLength(document.text, "utf8"),
		role: "inventory",
	};
}

function unreadableDiagnostic(locator: string): Diagnostic {
	return {
		code: "openapi_spec_unreadable",
		canonical_callee: locator,
		canonical_call_shape: { arity: 0, receiver_type: null },
		evidence: [],
		count: 1,
	};
}

/**
 * Every inventory fact whose handler stayed unknown is a route the code half
 * did not reach. They aggregate into one diagnostic per served contract.
 */
function notInCodeDiagnostics(
	facts: readonly EndpointFact[],
): readonly Diagnostic[] {
	const byContract = new Map<string, number>();
	for (const fact of facts) {
		if (fact.handler.kind !== "unknown") {
			continue;
		}
		for (const ref of fact.contract_refs) {
			byContract.set(
				ref.contract_id,
				(byContract.get(ref.contract_id) ?? 0) + 1,
			);
		}
	}
	return [...byContract.entries()]
		.sort(([left], [right]) => (left < right ? -1 : 1))
		.map(([contractId, count]) => ({
			code: "openapi_route_not_in_code" as const,
			canonical_callee: contractId,
			canonical_call_shape: { arity: 0, receiver_type: null },
			evidence: [],
			count,
		}));
}
