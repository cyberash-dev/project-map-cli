import type {
	Diagnostic,
	DiagnosticCode,
} from "../../../core/domain/facts/diagnostic.js";
import type {
	Destination,
	OutboundOperationFact,
} from "../../../core/domain/facts/fact.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { AnalysisUnit } from "../../../core/ports/analysis-unit.port.js";
import type {
	ClientRegistry,
	ConsumedContract,
	DeclaredSink,
	ModuleIdMapping,
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
import { byteOffsetTable } from "../index/anchors.js";
import { pythonDeclarationIndex } from "../index/python/declarations.js";
import { ancestry } from "../index/python/hierarchy.js";
import { pythonImportIndex } from "../index/python/imports.js";
import { argumentFor, keywordArguments } from "../inbound/argument-selector.js";
import { type DiagnosticSite, mergeDiagnostics } from "../merge/diagnostics.js";
import { canonicalPathIr } from "../openapi/path-grammar.js";
import { foldPythonValue } from "../value/python-value.js";
import { splitAbsoluteUrl } from "./absolute-url.js";
import {
	type DraftOutboundFact,
	type JoinKey,
	outboundDraft,
} from "./ladder.js";
import {
	inLibraryDestinations,
	memberAnchor,
	moduleIdOfAncestry,
	symbolOf,
} from "./library.js";
import {
	clientRegistryIndex,
	type RegistryIndex,
	type ResolvedType,
} from "./registry.js";
import {
	bindingOf,
	callOfMember,
	crossesSinkBoundary,
	sinkOfAncestry,
} from "./sinks.js";
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
	readonly registry: readonly ClientRegistry[];
	readonly moduleIds: readonly ModuleIdMapping[];
	readonly consumes: readonly ConsumedContract[];
};

export type OutboundResult = {
	readonly facts: readonly DraftOutboundFact[];
	readonly diagnostics: readonly Diagnostic[];
};

type ModuleView = {
	readonly path: string;
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
	readonly registry: RegistryIndex;
	readonly request: PythonOutboundRequest;
	/* Nodes a claimed site read through def-use: they are not separate calls. */
	readonly consumed: Set<number>;
	/* Claimed sites whose declared selector reached no node. */
	readonly unresolvedSelectors: DiagnosticSite[];
};

/** An unclassified site, keyed so a later def-use claim can withdraw it. */
type Candidate = {
	readonly startIndex: number;
	readonly site: DiagnosticSite;
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
	const registry = clientRegistryIndex({
		registries: request.registry,
		modules,
		sourcePaths,
	});
	const consumed = new Set<number>();
	const unresolvedSelectors: DiagnosticSite[] = [];
	const facts: DraftOutboundFact[] = [];
	const candidates: Candidate[] = [];
	for (const view of modules.values()) {
		const context = {
			view,
			modules,
			sourcePaths,
			constructions,
			registry,
			request,
			consumed,
			unresolvedSelectors,
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
		(candidate) => !consumed.has(candidate.startIndex),
	);
	return {
		facts,
		diagnostics: mergeDiagnostics([
			...unclassified.map((candidate) => candidate.site),
			...unresolvedSelectors,
		]),
	};
}

function parseModules(request: PythonOutboundRequest): Map<string, ModuleView> {
	const modules = new Map<string, ModuleView>();
	for (const source of request.unit.sources) {
		if (!source.path.endsWith(".py")) {
			continue;
		}
		const file = request.parser.parse("python", source.text, source.path);
		if (file === null) {
			continue;
		}
		modules.set(source.path, {
			path: source.path,
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
		declaredTier(site, context) ??
		libraryTier(site, context)
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
	if (pathArg !== null && pathNode === null) {
		context.unresolvedSelectors.push(
			diagnosticSite(site, context, "selector_unresolved"),
		);
	}
	const composed = throughPathVia(pathNode, match, context.consumed);
	const join = libraryHalfKey(site, context);
	const destinations = destinationsOf(site, match, context);
	return outboundDraft({
		provenance: "declared",
		method: declaredMethod(site, match),
		path: canonicalPathIr([provenPath(composed, site, context, proofPath())]),
		destinations:
			join === null ? destinations : inLibraryDestinations(destinations),
		ownerOperation: site.ownerOperation,
		anchor: anchorOf(site.call, context.view),
		join,
	});
}

/**
 * The library half of project-map:BEH-012. It exists only where the enclosing
 * declaration is itself the operation: a call on someone else's instance is a
 * consumer of that operation, never a member of it.
 */
function libraryHalfKey(site: CallSite, context: Context): JoinKey | null {
	if (site.receiver?.text !== "self") {
		return null;
	}
	const ancestors = ancestryOf(site, context);
	const moduleId = moduleIdOfAncestry(ancestors, context.request.moduleIds);
	const member = site.ownerOperation.split(".")[1];
	if (moduleId === null || member === undefined) {
		return null;
	}
	const anchor = memberAnchor(ancestors, member);
	return {
		moduleId,
		calleeOperation:
			anchor === null
				? { kind: "unknown", reason: "cross_boundary" }
				: symbolOf(anchor, member),
	};
}

/**
 * The consumer half of project-map:BEH-012. The receiver's type is proven and
 * carries a module identity, but the member it names is declared inside the
 * library, so the operation itself stays typed rather than guessed.
 */
function libraryTier(
	site: CallSite,
	context: Context,
): DraftOutboundFact | null {
	const reached = libraryCallee(site, context);
	if (reached === null) {
		return null;
	}
	const ancestors = ancestryOfType(reached.type, context);
	const moduleId = moduleIdOfAncestry(ancestors, context.request.moduleIds);
	if (moduleId === null) {
		return null;
	}
	const hole: ValueIr = { kind: "unknown", reason: "operation_in_library" };
	return outboundDraft({
		provenance: "declared",
		method: hole,
		path: hole,
		destinations: inLibraryDestinations(
			consumerDestinations(reached.type, ancestors, context),
		),
		ownerOperation: site.ownerOperation,
		anchor: anchorOf(site.call, context.view),
		join: { moduleId, calleeOperation: reached.callee },
	});
}

type LibraryCallee = {
	readonly type: ResolvedType;
	readonly callee: OutboundOperationFact["callee_operation"];
};

/**
 * The type a call reaches through a declared container, with the member it
 * names. A member selected at run time keeps the type and types the member.
 */
function libraryCallee(site: CallSite, context: Context): LibraryCallee | null {
	const dynamic = dynamicMemberOf(site, context);
	if (dynamic !== null) {
		return dynamic;
	}
	if (site.member === null || site.receiver === null) {
		return null;
	}
	const type = context.registry.typeOf(site.receiver.text);
	if (type === null) {
		return null;
	}
	const callee = site.call.childForFieldName("function");
	return callee === null
		? null
		: {
				type,
				callee: symbolOf(anchorOf(callee, context.view), site.member),
			};
}

/** `getattr(<container access>, <expression>)`: the type holds, the member does not. */
function dynamicMemberOf(
	site: CallSite,
	context: Context,
): LibraryCallee | null {
	const callee = site.call.childForFieldName("function");
	if (callee === null || callee.type !== "call") {
		return null;
	}
	if (callee.childForFieldName("function")?.text !== "getattr") {
		return null;
	}
	const receiver = callee.childForFieldName("arguments")?.namedChildren[0];
	const type =
		receiver === undefined ? null : context.registry.typeOf(receiver.text);
	return type === null
		? null
		: { type, callee: { kind: "unknown", reason: "dynamic" } };
}

function consumerDestinations(
	type: ResolvedType,
	ancestors: ReturnType<typeof ancestryOf>,
	context: Context,
): readonly Destination[] {
	const sink = sinkOfAncestry(ancestors, context.request.sinks);
	return resolveDestinations({
		selector: sink?.target ?? null,
		instance: null,
		isOwnInstance: false,
		ownConstructions: context.constructions.get(type.name) ?? [],
		declaredBindings: ancestors.map(
			(ancestor) => ancestor.declared?.constants ?? new Map(),
		),
		readable: ancestors.some((ancestor) => ancestor.declared !== null),
		fold: (node) => foldAncestorValue(node, ancestors, context),
		argumentOf: namedArgument,
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

/** Bounds one proof path of project-map:CTR-007 to three def-use edges. */
const MAX_PROOF_STEPS = 3;

type ProofPath = {
	readonly seen: Set<string>;
	readonly steps: number;
};

function proofPath(): ProofPath {
	return { seen: new Set(), steps: 0 };
}

/* A call and its leftmost receiver share a start offset, so the span alone
 * would read `x.format(y)` and `x` as one node. */
function nodeKey(node: SyntaxNode): string {
	return `${node.startIndex}:${node.endIndex}:${node.type}`;
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
	path: ProofPath,
): ValueIr {
	if (node === null) {
		return { kind: "unknown", reason: "dynamic" };
	}
	const key = nodeKey(node);
	if (path.seen.has(key)) {
		return { kind: "unknown", reason: "recursive" };
	}
	path.seen.add(key);
	if (node.type === "call") {
		return provenPath(templateOfCall(node), site, context, path);
	}
	if (node.type === "attribute") {
		return foldPythonValue(
			classConstant(node, site, context),
			context.view.imports,
		);
	}
	if (node.type !== "identifier") {
		return foldPythonValue(node, context.view.imports);
	}
	if (path.steps >= MAX_PROOF_STEPS) {
		return { kind: "unknown", reason: "depth_exceeded" };
	}
	return provenPath(localBinding(site.call, node.text), site, context, {
		seen: path.seen,
		steps: path.steps + 1,
	});
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
	const type = receiverType(site, context);
	return type === null ? [] : ancestryOfType(type, context);
}

function ancestryOfType(type: ResolvedType, context: Context) {
	return ancestry(type.name, {
		view: type.view,
		modules: context.modules,
		sourcePaths: context.sourcePaths,
	});
}

/**
 * The type of the receiver: the enclosing declaration for its own instance, the
 * type a local construction named, and the type a declared container binds to
 * the attribute an access reaches. A receiver none of the three proves has no
 * type and claims no sink.
 */
function receiverType(site: CallSite, context: Context): ResolvedType | null {
	if (site.receiver?.text === "self") {
		const owner = site.ownerOperation.split(".")[0] ?? "";
		return owner.length === 0 ? null : { name: owner, view: context.view };
	}
	const construction = instanceOf(site);
	const constructed = construction?.childForFieldName("function")?.text ?? null;
	if (constructed !== null) {
		return { name: constructed, view: context.view };
	}
	return site.receiver === null
		? null
		: context.registry.typeOf(site.receiver.text);
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
	const type = receiverType(site, context);
	const ancestors = ancestryOf(site, context);
	return resolveDestinations({
		selector: bindingOf(match, "target"),
		instance: instanceOf(site),
		isOwnInstance: site.receiver?.text === "self",
		ownConstructions: context.constructions.get(type?.name ?? "") ?? [],
		declaredBindings: ancestors.map(
			(ancestor) => ancestor.declared?.constants ?? new Map(),
		),
		readable: ancestors.some((ancestor) => ancestor.declared !== null),
		fold: (node) => foldAncestorValue(node, ancestors, context),
		argumentOf: namedArgument,
	});
}

/**
 * A declaration is folded against the imports of the module that declares it,
 * not of the module that reads it: a base class in another file names its
 * configuration through its own import.
 */
function foldAncestorValue(
	node: SyntaxNode | null,
	ancestors: ReturnType<typeof ancestryOf>,
	context: Context,
) {
	for (const ancestor of ancestors) {
		const bound = [...(ancestor.declared?.constants.values() ?? [])];
		if (node !== null && bound.includes(node)) {
			return foldPythonValue(node, ancestor.view.imports);
		}
	}
	return foldPythonValue(node, context.view.imports);
}

function namedArgument(
	construction: SyntaxNode,
	step: { readonly kind: string; readonly selector?: number | string },
): SyntaxNode | null {
	const args = construction.childForFieldName("arguments");
	if (args === null || step.selector === undefined) {
		return null;
	}
	const positional = args.namedChildren.filter(
		(node) => node.type !== "keyword_argument",
	);
	return typeof step.selector === "number"
		? (positional[step.selector] ?? null)
		: (keywordArguments(args).get(step.selector) ?? null);
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
 * The candidate universe of project-map:BEH-013: a call inside a transport
 * package that no tier claimed, and a call that leaves a declared sink through
 * a member the sink does not list. Anything else is an arbitrary member call,
 * which is neither diagnosed nor counted.
 */
function collectUnclassified(
	site: CallSite,
	context: Context,
	into: Candidate[],
): void {
	if (!insideUniverse(site, context)) {
		return;
	}
	into.push({
		startIndex: site.call.startIndex,
		site: diagnosticSite(site, context, "external_call_unclassified"),
	});
}

function insideUniverse(site: CallSite, context: Context): boolean {
	const origin = calleeOrigin(site, context);
	if (origin !== null && isTransportPackage(origin)) {
		return true;
	}
	if (site.member === null) {
		return false;
	}
	return crossesSinkBoundary(
		ancestryOf(site, context),
		context.request.sinks,
		site.member,
	);
}

/**
 * The core a diagnostic merges on. Both components are resolved rather than
 * spelled: the callee through the provenance of its qualifier, the receiver
 * through the type the receiver was proven to hold.
 */
function diagnosticSite(
	site: CallSite,
	context: Context,
	code: DiagnosticCode,
): DiagnosticSite {
	return {
		code,
		canonicalCallee: calleeOrigin(site, context) ?? site.calleeText,
		shape: {
			arity: site.call.childForFieldName("arguments")?.namedChildCount ?? 0,
			receiver_type: receiverType(site, context)?.name ?? null,
		},
		anchor: anchorOf(site.call, context.view),
	};
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
