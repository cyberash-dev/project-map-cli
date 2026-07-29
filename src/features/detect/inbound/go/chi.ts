import type { SourceAnchor } from "../../../../core/domain/facts/anchor.js";
import type { ValueIr } from "../../../../core/domain/facts/value-ir.js";
import type { AnalysisUnit } from "../../../../core/ports/analysis-unit.port.js";
import type { DeclaredRouter } from "../../../../core/ports/config.port.js";
import type { ISourceParser } from "../../../../core/ports/parser.port.js";
import type { SyntaxNode } from "../../../../infrastructure/parser/ts-utils.js";
import { byteOffsetTable } from "../../index/anchors.js";
import { goImportIndex } from "../../index/go/imports.js";
import type { Diagnostic } from "../../../../core/domain/facts/diagnostic.js";
import {
	type DiagnosticSite,
	mergeDiagnostics,
} from "../../merge/diagnostics.js";
import type { DraftEndpointFact } from "../../merge/merge-table.js";
import { deriveResolution } from "../../merge/resolution.js";
import { canonicalPathIr } from "../../openapi/path-grammar.js";
import { foldGoValue } from "../../value/go-value.js";
import {
	analyzeGoRouterValues,
	type MountRecord,
	type RouterValue,
	type ScopeResult,
} from "./router-scope.js";

export type GoRouterResult = {
	readonly facts: readonly DraftEndpointFact[];
	readonly diagnostics: readonly Diagnostic[];
};

export type GoRouterRequest = {
	readonly unit: AnalysisUnit;
	readonly parser: ISourceParser;
	readonly routers: readonly DeclaredRouter[];
};

const LOST_IDENTITY: ValueIr = { kind: "unknown", reason: "dynamic" };

/**
 * Route registrations written against a router VALUE: the receiver is followed
 * back to the construction it came from, and the prefix chain is whatever that
 * value was mounted at.
 */
export function detectGoRouterRoutes(request: GoRouterRequest): GoRouterResult {
	if (request.routers.length === 0) {
		return { facts: [], diagnostics: [] };
	}
	const drafts: DraftEndpointFact[] = [];
	const unclassified: DiagnosticSite[] = [];
	for (const source of request.unit.sources) {
		if (!source.path.endsWith(".go")) {
			continue;
		}
		const file = request.parser.parse(
			"go",
			source.text,
			source.path,
			source.path,
		);
		if (file === null) {
			continue;
		}
		const scope = analyzeGoRouterValues(
			file,
			goImportIndex(file),
			request.routers,
		);
		const offsets = byteOffsetTable(source.text);
		drafts.push(...draftsOf(scope, source.path, offsets));
		unclassified.push(...diagnosticSitesOf(scope, source.path, offsets));
	}
	return { facts: drafts, diagnostics: mergeDiagnostics(unclassified) };
}

/**
 * A member call on a proven router that named no route. The callee is the
 * declared router DSL joined to the member, so two spellings of one router
 * merge onto one core.
 */
function diagnosticSitesOf(
	scope: ScopeResult,
	relPath: string,
	offsets: ReturnType<typeof byteOffsetTable>,
): readonly DiagnosticSite[] {
	return scope.unclassified.map((entry) => ({
		code: "external_registration_unclassified" as const,
		canonicalCallee: `${entry.router.dsl}.${entry.member}`,
		shape: { arity: entry.arity, receiver_type: entry.router.dsl },
		anchor: anchorOf(entry.call, relPath, offsets),
	}));
}

function draftsOf(
	scope: ScopeResult,
	relPath: string,
	offsets: ReturnType<typeof byteOffsetTable>,
): readonly DraftEndpointFact[] {
	return scope.registrations.map((registration) =>
		endpointDraft(
			canonicalPathIr([
				...prefixChain(registration.value, scope.mounts, new Set()),
				foldGoValue(registration.pathNode),
			]),
			registration.method,
			anchorOf(registration.call, relPath, offsets),
		),
	);
}

/**
 * The ordered prefixes a value was mounted under, outermost first. A value
 * mounted nowhere contributes nothing; one mounted twice, one whose lineage
 * was lost, and one that mounts itself each contribute a typed hole.
 */
function prefixChain(
	value: RouterValue,
	mounts: ReadonlyMap<string, readonly MountRecord[]>,
	seen: Set<string>,
): readonly ValueIr[] {
	if (value.identity === null) {
		return [LOST_IDENTITY];
	}
	if (seen.has(value.identity)) {
		return [{ kind: "unknown", reason: "recursive" }];
	}
	seen.add(value.identity);
	const records = mounts.get(value.identity) ?? [];
	const [record, ...rest] = records;
	if (record === undefined) {
		return [];
	}
	if (rest.length > 0) {
		return [LOST_IDENTITY];
	}
	const parent: RouterValue = { router: value.router, identity: record.parent };
	if (record.parent === null) {
		return [record.prefix];
	}
	return [...prefixChain(parent, mounts, seen), record.prefix];
}

function anchorOf(
	node: SyntaxNode,
	relPath: string,
	offsets: ReturnType<typeof byteOffsetTable>,
): SourceAnchor {
	return {
		path: relPath,
		start_byte: offsets.byteOffsetAt(node.startIndex),
		end_byte: offsets.byteOffsetAt(node.endIndex),
	};
}

function endpointDraft(
	path: ValueIr,
	method: string,
	anchor: SourceAnchor,
): DraftEndpointFact {
	const operation = {
		variants: [
			{ http: { method: { kind: "literal", value: method } as const, path } },
		],
	};
	return {
		kind: "endpoint",
		mechanism: "http",
		operation,
		handler: { kind: "unknown", reason: "operation_mapping_unresolved" },
		contract_refs: [],
		provenance: ["router"],
		resolution: deriveResolution({ operation, requiresDestination: false }),
		evidence: [{ ...anchor, role: "registration" }],
	};
}
