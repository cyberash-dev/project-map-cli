import type { SourceAnchor } from "../../../../core/domain/facts/anchor.js";
import type { ValueIr } from "../../../../core/domain/facts/value-ir.js";
import type { AnalysisUnit } from "../../../../core/ports/analysis-unit.port.js";
import type {
	DeclaredRouter,
	ServeRoot,
} from "../../../../core/ports/config.port.js";
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
import { goPackageIndex } from "../../index/go/packages.js";
import {
	analyzeGoRouterValues,
	type GoRouterFile,
	type MountRecord,
	type RouterValue,
	type ScopeResult,
	type UnclassifiedRegistration,
} from "./router-scope.js";

export type GoRouterResult = {
	readonly facts: readonly DraftEndpointFact[];
	readonly diagnostics: readonly Diagnostic[];
};

export type GoRouterRequest = {
	readonly unit: AnalysisUnit;
	readonly parser: ISourceParser;
	readonly routers: readonly DeclaredRouter[];
	readonly serveRoots: readonly ServeRoot[];
};

const UNANCHORED: ValueIr = { kind: "unknown", reason: "unanchored_router" };

/**
 * Route registrations written against a router VALUE: the receiver is followed
 * back to the construction it came from, and the prefix chain is whatever that
 * value was mounted at.
 */
export function detectGoRouterRoutes(request: GoRouterRequest): GoRouterResult {
	if (request.routers.length === 0) {
		return { facts: [], diagnostics: [] };
	}
	const files: GoRouterFile[] = [];
	const offsets = new Map<string, ReturnType<typeof byteOffsetTable>>();
	for (const source of request.unit.sources) {
		if (!source.path.endsWith(".go")) {
			continue;
		}
		const file = request.parser.parse("go", source.text, source.path);
		if (file === null) {
			continue;
		}
		files.push({ file, imports: goImportIndex(file) });
		offsets.set(source.path, byteOffsetTable(source.text));
	}
	const scope = analyzeGoRouterValues(
		files,
		request.routers,
		goPackageIndex(files.map((entry) => entry.file)),
		request.serveRoots,
	);
	return {
		facts: draftsOf(scope, offsets),
		diagnostics: [
			...mergeDiagnostics([
				...sitesOf(
					scope.unclassified,
					"external_registration_unclassified",
					offsets,
				),
				...sitesOf(scope.lostMounts, "router_mount_unresolved", offsets),
				...unanchoredSites(scope, offsets),
			]),
			...scope.serveRootFailures.map(serveRootDiagnostic),
		],
	};
}

/**
 * A declared anchor that named no single router is a configuration the analysis
 * cannot honour, so it fails check mode on the code alone rather than waiting
 * for the bytes to drift.
 */
function serveRootDiagnostic(symbol: string): Diagnostic {
	return {
		code: "serve_root_unresolved",
		canonical_callee: symbol,
		canonical_call_shape: { arity: 0, receiver_type: null },
		evidence: [],
		count: 1,
	};
}

function unanchoredSites(
	scope: ScopeResult,
	offsets: Offsets,
): readonly DiagnosticSite[] {
	return scope.registrations
		.filter((registration) => anchoredPath(registration, scope) === UNANCHORED)
		.map((registration) => ({
			code: "unanchored_router" as const,
			canonicalCallee: `${registration.value.router.dsl}.${methodMember(registration.method)}`,
			shape: {
				arity: 2,
				receiver_type: registration.value.router.dsl,
			},
			anchor: anchorOf(registration.call, registration.relPath, offsets),
		}));
}

function methodMember(method: ValueIr): string {
	if (method.kind !== "literal") {
		return "Handle";
	}
	return method.value.charAt(0) + method.value.slice(1).toLowerCase();
}

type Offsets = ReadonlyMap<string, ReturnType<typeof byteOffsetTable>>;

/**
 * A member call on a proven router that named no route, and a mount whose
 * sub-router did not resolve. The callee is the declared router DSL joined to
 * the member, so two spellings of one router merge onto one core.
 */
function sitesOf(
	entries: readonly UnclassifiedRegistration[],
	code: DiagnosticSite["code"],
	offsets: Offsets,
): readonly DiagnosticSite[] {
	return entries.map((entry) => ({
		code,
		canonicalCallee: `${entry.router.dsl}.${entry.member}`,
		shape: { arity: entry.arity, receiver_type: entry.router.dsl },
		anchor: anchorOf(entry.call, entry.relPath, offsets),
	}));
}

function draftsOf(
	scope: ScopeResult,
	offsets: Offsets,
): readonly DraftEndpointFact[] {
	return scope.registrations.map((registration) =>
		endpointDraft(
			anchoredPath(registration, scope),
			registration.method,
			anchorOf(registration.call, registration.relPath, offsets),
		),
	);
}

/**
 * An absolute route is composed only from a declared serve root. A chain that
 * reaches no anchor publishes no path at all rather than the part of itself it
 * proved: a partial path would push a suffix match onto the consumer, which is
 * ambiguous wherever two mounts end in the same segments.
 */
function anchoredPath(
	registration: ScopeResult["registrations"][number],
	scope: ScopeResult,
): ValueIr {
	const prefixes = prefixChain(
		registration.value,
		scope.mounts,
		scope.anchors,
		new Set(),
	);
	return prefixes === null
		? UNANCHORED
		: canonicalPathIr([...prefixes, registration.path]);
}

/**
 * The prefixes a value is exposed under, outermost first, ending at the mount
 * its serve root declares. Null is unanchored: no anchor, mounted twice, a lost
 * lineage, or a cycle.
 */
function prefixChain(
	value: RouterValue,
	mounts: ReadonlyMap<string, readonly MountRecord[]>,
	anchors: ReadonlyMap<string, string>,
	seen: Set<string>,
): readonly ValueIr[] | null {
	if (value.identity.kind !== "proven") {
		return null;
	}
	const key = value.identity.key;
	if (seen.has(key)) {
		return null;
	}
	seen.add(key);
	const declared = anchors.get(key);
	const records = mounts.get(key) ?? [];
	const [record, ...rest] = records;
	if (record === undefined || rest.length > 0) {
		return declared === undefined || rest.length > 0
			? null
			: [{ kind: "literal", value: declared }];
	}
	const parent: RouterValue =
		record.parent === null
			? value
			: {
					router: value.router,
					identity: { kind: "proven", key: record.parent },
				};
	const above =
		record.parent === null
			? anchoredHead(declared)
			: prefixChain(parent, mounts, anchors, seen);
	return above === null ? null : [...above, record.prefix];
}

function anchoredHead(declared: string | undefined): readonly ValueIr[] | null {
	return declared === undefined ? null : [{ kind: "literal", value: declared }];
}

function anchorOf(
	node: SyntaxNode,
	relPath: string,
	offsets: Offsets,
): SourceAnchor {
	const table = offsets.get(relPath);
	return {
		path: relPath,
		start_byte: table?.byteOffsetAt(node.startIndex) ?? node.startIndex,
		end_byte: table?.byteOffsetAt(node.endIndex) ?? node.endIndex,
	};
}

function endpointDraft(
	path: ValueIr,
	method: ValueIr,
	anchor: SourceAnchor,
): DraftEndpointFact {
	const operation = { variants: [{ http: { method, path } }] };
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
