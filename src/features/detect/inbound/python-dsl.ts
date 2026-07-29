import type { SourceAnchor } from "../../../core/domain/facts/anchor.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { AnalysisUnit } from "../../../core/ports/analysis-unit.port.js";
import type { DeclaredRouter } from "../../../core/ports/config.port.js";
import type {
	ISourceParser,
	ParsedFile,
} from "../../../core/ports/parser.port.js";
import {
	findAll,
	rootOf,
	type SyntaxNode,
} from "../../../infrastructure/parser/ts-utils.js";
import { byteOffsetTable } from "../index/anchors.js";
import { originMatches } from "../index/module-resolver.js";
import {
	pythonDeclarationIndex,
	pythonStringLiteral,
	type PythonDeclarationIndex,
} from "../index/python/declarations.js";
import {
	pythonImportIndex,
	type PythonImportIndex,
} from "../index/python/imports.js";
import type { DraftEndpointFact } from "../merge/merge-table.js";
import { deriveResolution } from "../merge/resolution.js";
import { canonicalPath } from "../openapi/path-grammar.js";
import { argumentFor, keywordArguments } from "./argument-selector.js";
import { verbsOfHandler } from "./handler-verbs.js";

export type PythonDslRequest = {
	readonly unit: AnalysisUnit;
	readonly parser: ISourceParser;
	readonly routers: readonly DeclaredRouter[];
};

type ModuleView = {
	readonly file: ParsedFile;
	readonly imports: PythonImportIndex;
	readonly declarations: PythonDeclarationIndex;
	readonly offsets: ReturnType<typeof byteOffsetTable>;
};

/**
 * Route registrations written as a declaration DSL: a call whose callee is the
 * declared type, or a local subclass of it, carrying the path and the handler
 * as arguments.
 */
export function detectPythonDslRoutes(
	request: PythonDslRequest,
): readonly DraftEndpointFact[] {
	if (request.routers.length === 0) {
		return [];
	}
	const modules = parseModules(request);
	const drafts: DraftEndpointFact[] = [];
	for (const view of modules.values()) {
		drafts.push(...routesOfModule(view, modules, request.routers));
	}
	return drafts;
}

function parseModules(request: PythonDslRequest): Map<string, ModuleView> {
	const modules = new Map<string, ModuleView>();
	for (const source of request.unit.sources) {
		if (!source.path.endsWith(".py")) {
			continue;
		}
		const file = request.parser.parse(
			"python",
			source.text,
			source.path,
			source.path,
		);
		if (file === null) {
			continue;
		}
		modules.set(source.path, {
			file,
			imports: pythonImportIndex(file),
			declarations: pythonDeclarationIndex(file),
			offsets: byteOffsetTable(source.text),
		});
	}
	return modules;
}

function routesOfModule(
	view: ModuleView,
	modules: ReadonlyMap<string, ModuleView>,
	routers: readonly DeclaredRouter[],
): DraftEndpointFact[] {
	const drafts: DraftEndpointFact[] = [];
	for (const call of findAll(
		rootOf(view.file.tree),
		(node) => node.type === "call",
	)) {
		const callee = call.childForFieldName("function");
		if (callee === null || callee.type !== "identifier") {
			continue;
		}
		const router = matchingRouter(callee.text, view, routers);
		if (router === null) {
			continue;
		}
		drafts.push(
			...draftsFor({ call, callee: callee.text, view, modules, router }),
		);
	}
	return drafts;
}

/**
 * A callee claims a router only when its origin resolves to the declared type,
 * directly or through a locally declared subclass. A name that merely matches
 * resolves nowhere and claims nothing.
 */
function matchingRouter(
	callee: string,
	view: ModuleView,
	routers: readonly DeclaredRouter[],
): DeclaredRouter | null {
	for (const router of routers) {
		if (originOfType(callee, view) === null) {
			continue;
		}
		const origin = originOfType(callee, view);
		if (origin !== null && originMatches(router.dsl, origin)) {
			return router;
		}
	}
	return null;
}

function originOfType(name: string, view: ModuleView): string | null {
	const imported = view.imports.originOf(name);
	if (imported !== null && !view.imports.isShadowedLocally(name)) {
		return imported;
	}
	const declared = view.declarations.classOf(name);
	if (declared === null) {
		return null;
	}
	for (const base of declared.bases) {
		const origin = view.imports.originOf(base);
		if (origin !== null) {
			return origin;
		}
	}
	return null;
}

type DraftRequest = {
	readonly call: SyntaxNode;
	readonly callee: string;
	readonly view: ModuleView;
	readonly modules: ReadonlyMap<string, ModuleView>;
	readonly router: DeclaredRouter;
};

function draftsFor(request: DraftRequest): DraftEndpointFact[] {
	const args = request.call.childForFieldName("arguments");
	if (args === null) {
		return [];
	}
	const positional = args.namedChildren.filter(
		(node) => node.type !== "keyword_argument",
	);
	const keywords = keywordArguments(args);
	const pathNode = argumentFor(request.router.pathArg, positional, keywords);
	if (pathNode === null) {
		return [];
	}
	const literal = pythonStringLiteral(pathNode);
	if (literal === null) {
		return [];
	}
	const path = canonicalPath([prefixOf(request), literal]);
	const anchor = anchorOf(request.call, request.view);
	const verbs = verbsOfHandler({
		handlerNode: handlerNodeFor(request, positional, keywords),
		view: request.view,
		modules: request.modules,
		sourcePaths: [...request.modules.keys()],
	});
	/*
	 * A handler answering several verbs at one path is several endpoints.
	 * One that answers none has its handler outside the unit, so the verb is
	 * typed rather than guessed.
	 */
	if (verbs.length === 0) {
		return [
			endpointDraft({
				path,
				method: { kind: "unknown", reason: "cross_boundary" },
				anchor,
			}),
		];
	}
	return verbs.map((verb) =>
		endpointDraft({
			path,
			method: { kind: "literal", value: verb },
			anchor,
		}),
	);
}

function handlerNodeFor(
	request: DraftRequest,
	positional: readonly SyntaxNode[],
	keywords: ReadonlyMap<string, SyntaxNode>,
): SyntaxNode | null {
	if (request.router.verbFrom === null) {
		return null;
	}
	return argumentFor(request.router.verbFrom.handler, positional, keywords);
}

function prefixOf(request: DraftRequest): string {
	if (request.router.prefixFrom === null) {
		return "";
	}
	const step = request.router.prefixFrom[0];
	if (step === undefined || step.kind !== "class_const") {
		return "";
	}
	const declared = request.view.declarations.classOf(request.callee);
	const constant = declared?.constants.get(step.selector);
	return constant === undefined ? "" : (pythonStringLiteral(constant) ?? "");
}

function anchorOf(node: SyntaxNode, view: ModuleView): SourceAnchor {
	return {
		path: view.file.relPath,
		start_byte: view.offsets.byteOffsetAt(node.startIndex),
		end_byte: view.offsets.byteOffsetAt(node.endIndex),
	};
}

type EndpointDraftRequest = {
	readonly path: string;
	readonly method: ValueIr;
	readonly anchor: SourceAnchor;
};

function endpointDraft(request: EndpointDraftRequest): DraftEndpointFact {
	const operation = {
		variants: [
			{
				http: {
					method: request.method,
					path: { kind: "literal", value: request.path } as const,
				},
			},
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
		evidence: [{ ...request.anchor, role: "registration" }],
	};
}
