import type { Evidence } from "../../../core/domain/facts/anchor.js";
import type {
	CallShape,
	Diagnostic,
} from "../../../core/domain/facts/diagnostic.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { AnalysisUnit } from "../../../core/ports/analysis-unit.port.js";
import type {
	ConsumedContract,
	DeclaredSink,
} from "../../../core/ports/config.port.js";
import type {
	ISourceParser,
	ParsedFile,
} from "../../../core/ports/parser.port.js";
import {
	findAll,
	rootOf,
	type SyntaxNode,
} from "../../../infrastructure/parser/ts-utils.js";
import { orderEvidence } from "../canonical/array-order.js";
import { jcs } from "../canonical/jcs.js";
import { byteOffsetTable } from "../index/anchors.js";
import { pythonDeclarationIndex } from "../index/python/declarations.js";
import { ancestry } from "../index/python/hierarchy.js";
import { pythonImportIndex } from "../index/python/imports.js";
import { argumentFor, keywordArguments } from "../inbound/argument-selector.js";
import { canonicalPathIr } from "../openapi/path-grammar.js";
import { foldPythonValue } from "../value/python-value.js";
import { splitAbsoluteUrl } from "./absolute-url.js";
import { type DraftOutboundFact, outboundDraft } from "./ladder.js";
import { bindingOf, callOfMember, sinkOfAncestry } from "./sinks.js";
import { resolveDestinations } from "./target-binding.js";
import {
	isRequestBuilder,
	isSendingMember,
	isTransportPackage,
} from "./transports.js";
import { type CallSite, callSitesOf } from "./python-sites.js";

export type PythonOutboundRequest = {
	readonly unit: AnalysisUnit;
	readonly parser: ISourceParser;
	readonly sinks: readonly DeclaredSink[];
	readonly consumes: readonly ConsumedContract[];
};

export type OutboundResult = {
	readonly facts: readonly DraftOutboundFact[];
	readonly diagnostics: readonly Diagnostic[];
};

type ModuleView = {
	readonly file: ParsedFile;
	readonly imports: ReturnType<typeof pythonImportIndex>;
	readonly declarations: ReturnType<typeof pythonDeclarationIndex>;
	readonly offsets: ReturnType<typeof byteOffsetTable>;
};

type Context = {
	readonly view: ModuleView;
	readonly modules: ReadonlyMap<string, ModuleView>;
	readonly sourcePaths: readonly string[];
	readonly constructions: ReadonlyMap<string, readonly SyntaxNode[]>;
	readonly request: PythonOutboundRequest;
	/* Nodes a claimed site read through def-use: they are not separate calls. */
	readonly consumed: Set<number>;
};

export function detectPythonOutbound(
	request: PythonOutboundRequest,
): OutboundResult {
	if (request.sinks.length === 0 && request.consumes.length === 0) {
		return { facts: [], diagnostics: [] };
	}
	const modules = parseModules(request);
	const constructions = constructionIndex(modules);
	const sourcePaths = [...modules.keys()];
	const consumed = new Set<number>();
	const facts: DraftOutboundFact[] = [];
	const candidates: CallSite[] = [];
	for (const view of modules.values()) {
		const context = {
			view,
			modules,
			sourcePaths,
			constructions,
			request,
			consumed,
		};
		for (const site of callSitesOf(rootOf(view.file.tree))) {
			const fact = classify(site, context);
			if (fact === null) {
				collectUnclassified(site, context, candidates);
				continue;
			}
			facts.push(fact);
		}
	}
	/* Filtered after the walk: a construction is consumed by a send that the
	 * document order may put after it. */
	const unclassified = candidates.filter(
		(site) => !consumed.has(site.call.startIndex),
	);
	return { facts, diagnostics: diagnosticsOf(unclassified, modules) };
}

function parseModules(request: PythonOutboundRequest): Map<string, ModuleView> {
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

/**
 * Every construction of every class name, across the whole unit. The
 * owner_construction step of project-map:BEH-011 needs the constructions of a
 * type wherever they were written, not only in its own module.
 */
function constructionIndex(
	modules: ReadonlyMap<string, ModuleView>,
): Map<string, readonly SyntaxNode[]> {
	const byName = new Map<string, SyntaxNode[]>();
	for (const view of modules.values()) {
		for (const call of findAll(
			rootOf(view.file.tree),
			(node) => node.type === "call",
		)) {
			const callee = call.childForFieldName("function");
			if (callee === null || callee.type !== "identifier") {
				continue;
			}
			byName.set(callee.text, [...(byName.get(callee.text) ?? []), call]);
		}
	}
	return byName;
}

function classify(site: CallSite, context: Context): DraftOutboundFact | null {
	return (
		generatedTier(site, context) ??
		transportTier(site, context) ??
		declaredTier(site, context)
	);
}

/** Tier 1: a call into a module a `openapi.consumes` entry declares. */
function generatedTier(
	site: CallSite,
	context: Context,
): DraftOutboundFact | null {
	const origin = calleeOrigin(site, context);
	if (origin === null) {
		return null;
	}
	const declared = context.request.consumes.some((entry) =>
		insideModule(entry.generatedModule, origin),
	);
	if (!declared) {
		return null;
	}
	return outboundDraft({
		provenance: "generated",
		method: { kind: "unknown", reason: "operation_in_library" },
		path: { kind: "unknown", reason: "operation_in_library" },
		destinations: [{ kind: "unknown", reason: "operation_in_library" }],
		ownerOperation: site.ownerOperation,
		anchor: anchorOf(site.call, context.view),
	});
}

/** Tier 2: a sending member of a transport package, anchored at the send. */
function transportTier(
	site: CallSite,
	context: Context,
): DraftOutboundFact | null {
	const built = builtRequestOf(site, context);
	if (!claimsTransport(site, built, context)) {
		return null;
	}
	const source = built ?? site.call.childForFieldName("arguments");
	const split = splitAbsoluteUrl(transportUrl(source, context));
	return outboundDraft({
		provenance: "transport",
		method: transportMethod(site, built, context),
		path: canonicalPathIr([split.path]),
		destinations: [
			split.destination ?? { kind: "unknown", reason: "open_world_dispatch" },
		],
		ownerOperation: site.ownerOperation,
		anchor: anchorOf(site.call, context.view),
	});
}

/**
 * A sending member of a transport package claims the site, and so does a send
 * handed a request the same provenance built: the receiver of a deferred send
 * is a session nothing imported, but the request it carries is proven.
 */
function claimsTransport(
	site: CallSite,
	built: SyntaxNode | null,
	context: Context,
): boolean {
	if (built !== null) {
		return true;
	}
	const origin = calleeOrigin(site, context);
	return (
		site.member !== null &&
		origin !== null &&
		isTransportPackage(origin) &&
		isSendingMember(site.member)
	);
}

/**
 * A deferred send carries its method and URL on the construction it was handed,
 * so the fact is anchored at the send and the construction contributes through
 * def-use rather than emitting a fact of its own.
 */
function builtRequestOf(site: CallSite, context: Context): SyntaxNode | null {
	if (site.member !== "send") {
		return null;
	}
	const handed = site.call.childForFieldName("arguments")?.namedChildren[0];
	if (handed === undefined || handed.type !== "identifier") {
		return null;
	}
	const bound = localBinding(site.call, handed.text);
	if (bound === null) {
		return null;
	}
	const origin = dottedOrigin(
		bound.childForFieldName("function")?.text ?? "",
		context,
	);
	if (origin === null || !isRequestBuilder(origin)) {
		return null;
	}
	context.consumed.add(bound.startIndex);
	return bound.childForFieldName("arguments");
}

function transportMethod(
	site: CallSite,
	built: SyntaxNode | null,
	context: Context,
): ValueIr {
	if (built !== null) {
		const positional = built.namedChildren.filter(
			(node) => node.type !== "keyword_argument",
		);
		const node = keywordArguments(built).get("method") ?? positional[0] ?? null;
		return foldPythonValue(node, context.view.imports);
	}
	if (site.member === null || site.member === "request") {
		return { kind: "unknown", reason: "dynamic" };
	}
	return { kind: "literal", value: site.member.toUpperCase() };
}

function transportUrl(args: SyntaxNode | null, context: Context): ValueIr {
	if (args === null) {
		return { kind: "unknown", reason: "dynamic" };
	}
	const positional = args.namedChildren.filter(
		(node) => node.type !== "keyword_argument",
	);
	const keywords = keywordArguments(args);
	const node = keywords.get("url") ?? positional[positional.length - 1] ?? null;
	return foldPythonValue(node, context.view.imports);
}

/** Tier 3: a sending member of a declared sink, reached through its base type. */
function declaredTier(
	site: CallSite,
	context: Context,
): DraftOutboundFact | null {
	const match = sinkMatchOf(site, context);
	if (match === null) {
		return null;
	}
	const args = site.call.childForFieldName("arguments");
	const positional =
		args?.namedChildren.filter((node) => node.type !== "keyword_argument") ??
		[];
	const keywords = args === null ? new Map() : keywordArguments(args);
	const pathArg = bindingOf(match, "pathArg");
	const pathNode =
		pathArg === null ? null : argumentFor(pathArg, positional, keywords);
	const composed = throughPathVia(pathNode, match, context.consumed);
	return outboundDraft({
		provenance: "declared",
		method: declaredMethod(site, match),
		path: canonicalPathIr([
			foldPythonValue(
				provenPath(composed, site, context),
				context.view.imports,
			),
		]),
		destinations: destinationsOf(site, match, context),
		ownerOperation: site.ownerOperation,
		anchor: anchorOf(site.call, context.view),
	});
}

/**
 * The declared helper composes the path onto the sink's target, so the literal
 * lives on its argument. The node is read before normalization: a call to a
 * member the unit cannot see through normalizes to a hole that carries no
 * arguments.
 */
function throughPathVia(
	pathNode: SyntaxNode | null,
	match: ReturnType<typeof sinkMatchOf>,
	consumed: Set<number>,
): SyntaxNode | null {
	const via = match?.sink.pathVia ?? null;
	if (pathNode === null || via === null || pathNode.type !== "call") {
		return pathNode;
	}
	const callee = pathNode.childForFieldName("function");
	if (callee === null || callee.type !== "attribute") {
		return pathNode;
	}
	if (callee.childForFieldName("attribute")?.text !== via.member) {
		return pathNode;
	}
	if (callee.childForFieldName("object")?.text !== "self") {
		return pathNode;
	}
	consumed.add(pathNode.startIndex);
	return (
		pathNode.childForFieldName("arguments")?.namedChildren[via.arg] ?? null
	);
}

/**
 * Follows a path argument back to the literal it was built from: a local name
 * to the expression that bound it, a template call to the template it formats,
 * and a class attribute to the constant an ancestor declared.
 */
function provenPath(
	node: SyntaxNode | null,
	site: CallSite,
	context: Context,
): SyntaxNode | null {
	if (node === null) {
		return null;
	}
	if (node.type === "identifier") {
		return provenPath(localBinding(site.call, node.text), site, context);
	}
	if (node.type === "call") {
		return provenPath(templateOfCall(node), site, context);
	}
	if (node.type === "attribute") {
		return classConstant(node, site, context);
	}
	return node;
}

/** The template a formatting call renders; the arguments become holes. */
function templateOfCall(call: SyntaxNode): SyntaxNode | null {
	const callee = call.childForFieldName("function");
	if (callee === null || callee.type !== "attribute") {
		return null;
	}
	if (callee.childForFieldName("attribute")?.text !== "format") {
		return null;
	}
	return callee.childForFieldName("object");
}

function classConstant(
	node: SyntaxNode,
	site: CallSite,
	context: Context,
): SyntaxNode | null {
	if (node.childForFieldName("object")?.text !== "self") {
		return null;
	}
	const name = node.childForFieldName("attribute")?.text;
	if (name === undefined) {
		return null;
	}
	for (const ancestor of ancestryOf(site, context)) {
		const bound = ancestor.declared?.constants.get(name);
		if (bound !== undefined) {
			return bound;
		}
	}
	return null;
}

function declaredMethod(
	site: CallSite,
	match: NonNullable<ReturnType<typeof sinkMatchOf>>,
): ValueIr {
	const selector = bindingOf(match, "method");
	if (selector !== null || site.member === null) {
		return { kind: "unknown", reason: "dynamic" };
	}
	return { kind: "literal", value: site.member.toUpperCase() };
}

function sinkMatchOf(site: CallSite, context: Context) {
	if (site.member === null) {
		return null;
	}
	const ancestors = ancestryOf(site, context);
	const sink = sinkOfAncestry(ancestors, context.request.sinks);
	if (sink === null) {
		return null;
	}
	const call = callOfMember(sink, site.member);
	return call === null ? null : { sink, call };
}

function ancestryOf(site: CallSite, context: Context) {
	const type = receiverType(site);
	if (type === null) {
		return [];
	}
	return ancestry(type, {
		view: context.view,
		modules: context.modules,
		sourcePaths: context.sourcePaths,
	});
}

/**
 * The type of the receiver: the enclosing declaration for its own instance, and
 * otherwise the type a local construction named. A receiver bound to nothing
 * this scope constructed has no proven type and claims no sink.
 */
function receiverType(site: CallSite): string | null {
	if (site.receiver?.text === "self") {
		const owner = site.ownerOperation.split(".")[0] ?? "";
		return owner.length === 0 ? null : owner;
	}
	const construction = instanceOf(site);
	return construction?.childForFieldName("function")?.text ?? null;
}

function instanceOf(site: CallSite): SyntaxNode | null {
	if (site.receiver === null || site.receiver.type !== "identifier") {
		return null;
	}
	return localBinding(site.call, site.receiver.text);
}

function destinationsOf(
	site: CallSite,
	match: NonNullable<ReturnType<typeof sinkMatchOf>>,
	context: Context,
) {
	const type = receiverType(site) ?? "";
	return resolveDestinations({
		selector: bindingOf(match, "target"),
		instance: instanceOf(site),
		isOwnInstance: site.receiver?.text === "self",
		ownConstructions: context.constructions.get(type) ?? [],
		ancestry: ancestryOf(site, context),
		imports: context.view.imports,
	});
}

/** Whether a resolved origin names a member of a declared module. */
function insideModule(declared: string, origin: string): boolean {
	return origin === declared || origin.startsWith(`${declared}.`);
}

function calleeOrigin(site: CallSite, context: Context): string | null {
	return dottedOrigin(site.calleeText, context);
}

/** Rewrites a dotted callee onto the origin its leading qualifier resolves to. */
function dottedOrigin(dotted: string, context: Context): string | null {
	const root = dotted.split(".")[0];
	if (root === undefined) {
		return null;
	}
	const origin =
		context.view.imports.originOf(root) ?? context.view.imports.moduleOf(root);
	return origin === null ? null : `${origin}${dotted.slice(root.length)}`;
}

/**
 * The candidate universe this phase can see: a call inside a transport package
 * that no tier claimed, and a member of a declared sink instance that the sink
 * does not list. Anything else is an arbitrary member call and is not counted.
 */
function collectUnclassified(
	site: CallSite,
	context: Context,
	into: CallSite[],
): void {
	const origin = calleeOrigin(site, context);
	if (origin !== null && isTransportPackage(origin)) {
		into.push(site);
		return;
	}
	const ancestors = ancestryOf(site, context);
	if (
		ancestors.length > 0 &&
		sinkOfAncestry(ancestors, context.request.sinks)
	) {
		into.push(site);
	}
}

/**
 * Diagnostics merge by their core, and `count` is the number of DISTINCT
 * source anchors: one callee reached from three call sites is one diagnostic
 * with count three, never three diagnostics or a count of traversal visits.
 */
function diagnosticsOf(
	sites: readonly CallSite[],
	modules: ReadonlyMap<string, ModuleView>,
): readonly Diagnostic[] {
	const byCore = new Map<string, Evidence[]>();
	const shapes = new Map<string, CallShape>();
	for (const site of sites) {
		const view = viewOf(site, modules);
		if (view === null) {
			continue;
		}
		const shape: CallShape = {
			arity: site.call.childForFieldName("arguments")?.namedChildCount ?? 0,
			receiver_type: site.receiver?.text ?? null,
		};
		const key = `${site.calleeText} ${shape.arity} ${shape.receiver_type ?? ""}`;
		shapes.set(key, shape);
		byCore.set(key, [
			...(byCore.get(key) ?? []),
			{ ...anchorOf(site.call, view), role: "call" },
		]);
	}
	return [...byCore.entries()]
		.map(([key, evidence]) => diagnosticOf(key, evidence, shapes))
		.sort((left, right) =>
			left.canonical_callee < right.canonical_callee ? -1 : 1,
		);
}

function diagnosticOf(
	key: string,
	evidence: readonly Evidence[],
	shapes: ReadonlyMap<string, CallShape>,
): Diagnostic {
	const distinct = orderEvidence([
		...new Map(evidence.map((entry) => [jcs(entry), entry])).values(),
	]);
	return {
		code: "external_call_unclassified",
		canonical_callee: key.split(" ")[0] ?? "",
		canonical_call_shape: shapes.get(key) ?? { arity: 0, receiver_type: null },
		evidence: distinct,
		count: distinct.length,
	};
}

function viewOf(
	site: CallSite,
	modules: ReadonlyMap<string, ModuleView>,
): ModuleView | null {
	for (const view of modules.values()) {
		if (containsNode(rootOf(view.file.tree), site.call)) {
			return view;
		}
	}
	return null;
}

function containsNode(root: SyntaxNode, node: SyntaxNode): boolean {
	return root.startIndex <= node.startIndex && root.endIndex >= node.endIndex;
}

function localBinding(node: SyntaxNode, name: string): SyntaxNode | null {
	let cursor: SyntaxNode | null | undefined = node.parent;
	while (cursor !== null && cursor !== undefined) {
		if (cursor.type === "function_definition") {
			return bindingIn(cursor, name);
		}
		cursor = cursor.parent;
	}
	return null;
}

function bindingIn(scope: SyntaxNode, name: string): SyntaxNode | null {
	for (const assignment of findAll(
		scope,
		(child) => child.type === "assignment",
	)) {
		const target = assignment.childForFieldName("left");
		const value = assignment.childForFieldName("right");
		if (target?.text === name && value?.type === "call") {
			return value;
		}
	}
	return null;
}

function anchorOf(node: SyntaxNode, view: ModuleView) {
	return {
		path: view.file.relPath,
		start_byte: view.offsets.byteOffsetAt(node.startIndex),
		end_byte: view.offsets.byteOffsetAt(node.endIndex),
	};
}
