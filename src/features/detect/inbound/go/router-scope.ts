import type {
	ReasonCode,
	ValueIr,
} from "../../../../core/domain/facts/value-ir.js";
import type {
	DeclaredRouter,
	ServeRoot,
} from "../../../../core/ports/config.port.js";
import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";
import { type GoImportIndex, goOriginMatches } from "../../index/go/imports.js";
import type { GoPackageIndex } from "../../index/go/packages.js";
import { foldGoValue, type GoValueResolver } from "../../value/go-value.js";
import { jcs } from "../../canonical/jcs.js";
import { argumentFor } from "../argument-selector.js";
import {
	type FieldValue,
	type RouterRecord,
	recordOf,
	zeroValueOf,
} from "./router-record.js";
import {
	type CalleeDeclaration,
	calleeOf,
	parametersOf,
	seedSignature,
} from "./router-summary.js";
import { MUX_MEMBERS, MUX_ORIGIN, muxPattern } from "./servemux.js";
import {
	resolveServeRoot,
	type ResolvedServeRoot,
	returnOperands,
} from "./serve-root.js";

/* Go has no keyword arguments, so a keyword selector names nothing here. */
const NO_KEYWORDS = new Map<string, SyntaxNode>();

const CONSTRUCTORS = new Set(["NewRouter", "NewMux", "NewServeMux"]);

const VERBS = new Set([
	"Get",
	"Post",
	"Put",
	"Patch",
	"Delete",
	"Head",
	"Options",
	"Connect",
	"Trace",
]);

const MOUNT = "Mount";

/** Bounds the inbound summary to the three edges project-map:CTR-007 fixes. */
const MAX_CALL_EDGES = 3;

/**
 * The members chi itself hands a router identity through. `closureArg` names
 * the function literal whose first parameter receives the identity;
 * `prefixArg` names a pattern the derived router is mounted at.
 */
type BuiltInMember = {
	readonly member: string;
	readonly closureArg: number | null;
	readonly prefixArg: number | null;
};

const BUILT_INS: readonly BuiltInMember[] = [
	{ member: "With", closureArg: null, prefixArg: null },
	{ member: "Group", closureArg: 0, prefixArg: null },
	{ member: "Route", closureArg: 1, prefixArg: 0 },
];

/** A router value whose lineage was lost carries why it was lost. */
export type Identity =
	| { readonly kind: "proven"; readonly key: string }
	| { readonly kind: "lost"; readonly reason: ReasonCode };

export type RouterValue = {
	readonly router: DeclaredRouter;
	readonly identity: Identity;
};

export type Registration = {
	readonly value: RouterValue;
	readonly path: ValueIr;
	readonly method: ValueIr;
	readonly call: SyntaxNode;
	readonly relPath: string;
	/** Interprocedural distance the claiming walk reached this site at. */
	readonly distance: number;
};

export type MountRecord = {
	readonly prefix: ValueIr;
	readonly parent: string | null;
};

/** A member call on a proven router value that no registration form claims. */
export type UnclassifiedRegistration = {
	readonly router: DeclaredRouter;
	readonly member: string;
	readonly arity: number;
	readonly call: SyntaxNode;
	readonly relPath: string;
};

export type ScopeResult = {
	readonly registrations: readonly Registration[];
	readonly mounts: ReadonlyMap<string, readonly MountRecord[]>;
	readonly unclassified: readonly UnclassifiedRegistration[];
	readonly lostMounts: readonly UnclassifiedRegistration[];
	/** Identity key of an anchored router to the mount it is exposed under. */
	readonly anchors: ReadonlyMap<string, string>;
	/** Declared symbols the unit could not resolve to one anchored router. */
	readonly serveRootFailures: readonly string[];
};

type UnitState = {
	readonly routers: readonly DeclaredRouter[];
	readonly packages: GoPackageIndex;
	readonly registrations: Registration[];
	readonly mounts: Map<string, MountRecord[]>;
	readonly unclassified: UnclassifiedRegistration[];
	readonly lostMounts: UnclassifiedRegistration[];
	/** Bodies walked outright, so a pass does not claim one an edge claimed. */
	readonly entered: Set<string>;
	/** Least distance a seeded body was entered at, per project-map:CTR-007. */
	readonly enteredAt: Map<string, number>;
	readonly anchors: Map<string, string>;
	readonly serveRootFailures: string[];
};

type Analysis = {
	readonly unit: UnitState;
	readonly imports: GoImportIndex;
	readonly relPath: string;
	readonly directory: string;
	readonly depth: number;
	/** A walk that rebuilds bindings without claiming a site a pass already did. */
	readonly silent: boolean;
};

type Scope = {
	readonly bindings: Map<string, RouterValue>;
	readonly records: Map<string, RouterRecord>;
	readonly defined: Set<string>;
};

export type GoRouterFile = {
	readonly file: ParsedFile;
	readonly imports: GoImportIndex;
};

const LOST: (reason: ReasonCode) => Identity = (reason) => ({
	kind: "lost",
	reason,
});

/**
 * Binds every router value the unit constructs and attributes each registration
 * to the value its receiver resolves to. A body taking a router, directly or in
 * a record, is entered through the call edge that seeds it; a body reached by no
 * edge is walked once with that parameter's identity lost.
 */
export function analyzeGoRouterValues(
	files: readonly GoRouterFile[],
	routers: readonly DeclaredRouter[],
	packages: GoPackageIndex,
	serveRoots: readonly ServeRoot[] = [],
): ScopeResult {
	const unit: UnitState = {
		routers,
		packages,
		registrations: [],
		mounts: new Map(),
		unclassified: [],
		lostMounts: [],
		entered: new Set(),
		enteredAt: new Map(),
		anchors: new Map(),
		serveRootFailures: [],
	};
	for (const entry of files) {
		walkDeclarations(entry, unit, false);
	}
	for (const entry of files) {
		walkDeclarations(entry, unit, true);
	}
	for (const entry of serveRoots) {
		anchorServeRoot(entry, unit);
	}
	return {
		registrations: nearestRegistrations(unit.registrations),
		mounts: unit.mounts,
		unclassified: unit.unclassified,
		lostMounts: unit.lostMounts,
		anchors: unit.anchors,
		serveRootFailures: unit.serveRootFailures,
	};
}

/**
 * One site claimed along two paths keeps the nearer claim: project-map:CTR-007
 * discards a state reached by a longer path, and a walk that already emitted
 * before the shorter path ran would otherwise report the site twice.
 */
function nearestRegistrations(
	found: readonly Registration[],
): readonly Registration[] {
	const nearest = new Map<string, number>();
	for (const entry of found) {
		const seen = nearest.get(keyOf(entry));
		if (seen === undefined || entry.distance < seen) {
			nearest.set(keyOf(entry), entry.distance);
		}
	}
	return found.filter((entry) => nearest.get(keyOf(entry)) === entry.distance);
}

/**
 * One site claimed for two different routers at one distance is two routes, so
 * the distance decides and never the count.
 */
function keyOf(entry: Registration): string {
	return `${entry.relPath}#${entry.call.startIndex}#${jcs(entry.method)}`;
}

/** Bounds the follow of project-map:BEH-019 to three statically resolved edges. */
const MAX_RETURN_EDGES = 3;

/**
 * Follows the value a declared entry point returns to the router it holds. The
 * bodies were walked already, so this walk is silent: an identity key is a pure
 * function of file and offset, which is what lets a second walk rebuild the same
 * bindings without claiming any site twice.
 */
function anchorServeRoot(entry: ServeRoot, unit: UnitState): void {
	const resolved = resolveServeRoot(entry, unit.packages);
	const anchored =
		resolved === null ? null : returnedRouter(resolved, unit, 0, new Set());
	if (anchored === null) {
		unit.serveRootFailures.push(entry.function);
		return;
	}
	unit.anchors.set(anchored, entry.mount);
}

function returnedRouter(
	target: ResolvedServeRoot,
	unit: UnitState,
	depth: number,
	seen: Set<string>,
): string | null {
	const key = targetKey(target);
	if (depth > MAX_RETURN_EDGES || seen.has(key)) {
		return null;
	}
	seen.add(key);
	const analysis = silentFrame(target, unit, depth);
	const scope = seededScope(target.declaration, analysis);
	const body = target.declaration.childForFieldName("body");
	if (body !== null) {
		visitChildren(body, scope, analysis);
	}
	for (const operand of returnOperands(target.declaration, target.result)) {
		const found = anchoredOperand(operand, target, unit, {
			analysis,
			scope,
			depth,
			seen,
		});
		if (found !== null) {
			return found;
		}
	}
	return null;
}

type FollowContext = {
	readonly analysis: Analysis;
	readonly scope: Scope;
	readonly depth: number;
	readonly seen: Set<string>;
};

function anchoredOperand(
	operand: SyntaxNode,
	target: ResolvedServeRoot,
	unit: UnitState,
	context: FollowContext,
): string | null {
	const value = evaluate(operand, context.scope, context.analysis);
	if (value !== null && value.identity.kind === "proven") {
		return value.identity.key;
	}
	const next = followedReturn(operand, target, unit, context.analysis);
	return next === null
		? null
		: returnedRouter(next, unit, context.depth + 1, context.seen);
}

function targetKey(target: ResolvedServeRoot): string {
	return [target.relPath, target.declaration.startIndex, target.result].join(
		"#",
	);
}

/** A returned call hands its own first result on; the chain names no index. */
function followedReturn(
	operand: SyntaxNode,
	target: ResolvedServeRoot,
	unit: UnitState,
	analysis: Analysis,
): ResolvedServeRoot | null {
	const callee = calleeOf(operand, {
		imports: analysis.imports,
		directory: analysis.directory,
		packages: unit.packages,
		scope: target.declaration,
	});
	return callee === null
		? null
		: {
				declaration: callee.declaration,
				relPath: callee.relPath,
				directory: callee.directory,
				imports: callee.imports,
				result: 0,
				mount: target.mount,
			};
}

function silentFrame(
	target: ResolvedServeRoot,
	unit: UnitState,
	depth: number,
): Analysis {
	return {
		unit,
		imports: target.imports,
		relPath: target.relPath,
		directory: target.directory,
		depth,
		silent: true,
	};
}

function walkDeclarations(
	entry: GoRouterFile,
	unit: UnitState,
	summaryOnly: boolean,
): void {
	const analysis = frameOf(entry, unit, 0);
	for (const declaration of rootOf(entry.file.tree).namedChildren) {
		const body = declaration.childForFieldName("body");
		if (body === null) {
			continue;
		}
		if (takesRouter(declaration, analysis) !== summaryOnly) {
			continue;
		}
		const key = bodyKey(declaration, analysis);
		if (unit.entered.has(key)) {
			continue;
		}
		unit.entered.add(key);
		visitChildren(body, seededScope(declaration, analysis), analysis);
	}
}

function frameOf(
	entry: GoRouterFile,
	unit: UnitState,
	depth: number,
): Analysis {
	const cut = entry.file.relPath.lastIndexOf("/");
	return {
		unit,
		imports: entry.imports,
		relPath: entry.file.relPath,
		directory: cut < 0 ? "" : entry.file.relPath.slice(0, cut),
		depth,
		silent: false,
	};
}

function bodyKey(declaration: SyntaxNode, analysis: Analysis): string {
	return `${analysis.relPath}#${declaration.startIndex}`;
}

/** A body reached by no edge still claims its sites, with the router unproven. */
function seededScope(declaration: SyntaxNode, analysis: Analysis): Scope {
	const scope = freshScope();
	for (const parameter of parametersOf(declaration)) {
		const router = routerTypeOf(parameter.type, analysis);
		if (router !== null) {
			scope.bindings.set(parameter.name, {
				router,
				identity: LOST("cross_boundary"),
			});
			scope.defined.add(parameter.name);
			continue;
		}
		const record = unprovenRecord(parameter.type, analysis);
		if (record !== null) {
			scope.records.set(parameter.name, record);
		}
	}
	return scope;
}

function takesRouter(declaration: SyntaxNode, analysis: Analysis): boolean {
	return parametersOf(declaration).some(
		(parameter) =>
			routerTypeOf(parameter.type, analysis) !== null ||
			unprovenRecord(parameter.type, analysis) !== null,
	);
}

/**
 * The record a struct type declares, with every router field unproven. It is
 * what a body no call edge reached knows about its own parameter.
 */
function unprovenRecord(
	typeText: string,
	analysis: Analysis,
): RouterRecord | null {
	const declared = declaredStruct(typeText, analysis);
	if (declared === null) {
		return null;
	}
	const fields = new Map<string, FieldValue>();
	let carries = false;
	for (const [name, fieldType] of declared.fields) {
		const router = routerTypeOf(fieldType, declared.analysis);
		if (router === null) {
			fields.set(name, { kind: "zero", goType: fieldType });
			continue;
		}
		carries = true;
		fields.set(name, {
			kind: "router",
			value: { router, identity: LOST("cross_boundary") },
		});
	}
	return carries ? fields : null;
}

type DeclaredStruct = {
	readonly fields: ReadonlyMap<string, string>;
	readonly analysis: Analysis;
};

function declaredStruct(
	typeText: string,
	analysis: Analysis,
): DeclaredStruct | null {
	const bare = typeText.startsWith("*") ? typeText.slice(1) : typeText;
	const cut = bare.indexOf(".");
	const found =
		cut < 0
			? analysis.unit.packages.at(analysis.directory)
			: qualifiedPackage(bare.slice(0, cut), analysis);
	const declared =
		found?.declarations.typeOf(cut < 0 ? bare : bare.slice(cut + 1)) ?? null;
	if (found === null || declared === null || declared.fields.size === 0) {
		return null;
	}
	return {
		fields: declared.fields,
		analysis: { ...analysis, imports: found.imports },
	};
}

function qualifiedPackage(qualifier: string, analysis: Analysis) {
	const importPath = analysis.imports.pathOf(qualifier);
	return importPath === null
		? null
		: analysis.unit.packages.forImport(importPath);
}

function routerTypeOf(
	typeText: string,
	analysis: Analysis,
): DeclaredRouter | null {
	const bare = typeText.startsWith("*") ? typeText.slice(1) : typeText;
	const cut = bare.indexOf(".");
	if (cut < 0) {
		return null;
	}
	const importPath = analysis.imports.pathOf(bare.slice(0, cut));
	if (importPath === null) {
		return null;
	}
	return (
		analysis.unit.routers.find((candidate) =>
			goOriginMatches(candidate.dsl, importPath),
		) ?? null
	);
}

function freshScope(): Scope {
	return { bindings: new Map(), records: new Map(), defined: new Set() };
}

function childScope(scope: Scope): Scope {
	return {
		bindings: new Map(scope.bindings),
		records: new Map(scope.records),
		defined: new Set(scope.defined),
	};
}

function visitChildren(
	node: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): void {
	for (const child of node.namedChildren) {
		visit(child, scope, analysis);
	}
}

function visit(node: SyntaxNode, scope: Scope, analysis: Analysis): void {
	if (node.type === "func_literal") {
		visitLiteral(node, childScope(scope), analysis);
		return;
	}
	if (node.type === "if_statement" && visitGuard(node, scope, analysis)) {
		return;
	}
	if (bindDefinition(node, scope, analysis)) {
		return;
	}
	if (node.type === "call_expression" && classifyCall(node, scope, analysis)) {
		return;
	}
	visitChildren(node, scope, analysis);
}

/**
 * A branch guarded by a comparison of a proven router against nil cannot run,
 * so it binds nothing. Every way an identity is minted returns a live value.
 */
function visitGuard(
	node: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const taken = nilGuardBranch(node, scope);
	if (taken === null) {
		return false;
	}
	const branch = node.childForFieldName(taken);
	if (branch !== null) {
		visit(branch, scope, analysis);
	}
	return true;
}

function nilGuardBranch(
	node: SyntaxNode,
	scope: Scope,
): "consequence" | "alternative" | null {
	const condition = node.childForFieldName("condition");
	if (condition === null || condition.type !== "binary_expression") {
		return null;
	}
	const operator = condition.childForFieldName("operator")?.text ?? "";
	if (operator !== "==" && operator !== "!=") {
		return null;
	}
	const left = condition.childForFieldName("left");
	const right = condition.childForFieldName("right");
	const named = provenAgainstNil(left, right, scope);
	if (!named) {
		return null;
	}
	return operator === "==" ? "alternative" : "consequence";
}

function provenAgainstNil(
	left: SyntaxNode | null,
	right: SyntaxNode | null,
	scope: Scope,
): boolean {
	const pairs: readonly (readonly [SyntaxNode | null, SyntaxNode | null])[] = [
		[left, right],
		[right, left],
	];
	return pairs.some(
		([name, nil]) =>
			nil?.text === "nil" &&
			name?.type === "identifier" &&
			scope.bindings.get(name.text)?.identity.kind === "proven",
	);
}

function visitLiteral(
	literal: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): void {
	const body = literal.childForFieldName("body");
	if (body !== null) {
		visitChildren(body, scope, analysis);
	}
}

/**
 * A definition consumes its right-hand side: evaluating it already descends
 * wherever a nested closure or mount lives, so descending again would record
 * the same mount twice.
 */
function bindDefinition(
	node: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const pairs = definitionPairs(node);
	if (pairs === null) {
		return false;
	}
	for (const [name, expression] of pairs) {
		bindName(name, evaluate(expression, scope, analysis), scope);
	}
	return true;
}

function definitionPairs(
	node: SyntaxNode,
): readonly (readonly [string, SyntaxNode])[] | null {
	if (
		node.type === "short_var_declaration" ||
		node.type === "assignment_statement"
	) {
		return zipNames(
			namesOf(node.childForFieldName("left")),
			node.childForFieldName("right"),
		);
	}
	if (node.type !== "var_spec") {
		return null;
	}
	return zipNames(
		node.namedChildren
			.filter((child) => child.type === "identifier")
			.map((child) => child.text),
		node.childForFieldName("value"),
	);
}

function namesOf(list: SyntaxNode | null): readonly string[] {
	if (list === null) {
		return [];
	}
	return list.namedChildren.map((child) => child.text);
}

function zipNames(
	names: readonly string[],
	values: SyntaxNode | null,
): readonly (readonly [string, SyntaxNode])[] {
	if (values === null) {
		return [];
	}
	const expressions = values.namedChildren;
	return names.flatMap((name, index) => {
		const expression = expressions[index];
		return expression === undefined ? [] : [[name, expression] as const];
	});
}

/**
 * A name defined twice holds whichever value the run took, so its identity is
 * lost unless both definitions name the same value.
 */
function bindName(name: string, value: RouterValue | null, scope: Scope): void {
	const previous = scope.bindings.get(name);
	const wasDefined = scope.defined.has(name);
	scope.defined.add(name);
	if (!wasDefined) {
		if (value !== null) {
			scope.bindings.set(name, value);
		}
		return;
	}
	if (previous === undefined && value === null) {
		return;
	}
	if (
		previous !== undefined &&
		value !== null &&
		sameIdentity(previous.identity, value.identity)
	) {
		return;
	}
	const router = value?.router ?? previous?.router;
	if (router !== undefined) {
		scope.bindings.set(name, { router, identity: LOST("correlation_lost") });
	}
}

function sameIdentity(left: Identity, right: Identity): boolean {
	return (
		left.kind === "proven" && right.kind === "proven" && left.key === right.key
	);
}

function classifyCall(
	call: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const member = memberOf(call);
	if (member === null) {
		return followEdge(call, scope, analysis) !== null;
	}
	if (VERBS.has(member.name)) {
		return recordRegistration(call, member, scope, analysis);
	}
	if (MUX_MEMBERS.has(member.name)) {
		return recordMuxRegistration(call, member, scope, analysis);
	}
	if (member.name === MOUNT) {
		return recordMount(call, member, scope, analysis);
	}
	if (evaluate(call, scope, analysis) !== null) {
		return true;
	}
	recordUnclassified(call, member, scope, analysis);
	return false;
}

/**
 * A member call on a router the analysis proved crosses the router boundary of
 * project-map:BEH-013 without naming a route, so it is diagnosed rather than
 * guessed at. A receiver that is not a router crosses nothing.
 */
function recordUnclassified(
	call: SyntaxNode,
	member: Member,
	scope: Scope,
	analysis: Analysis,
): void {
	const receiver = evaluate(member.receiver, scope, analysis);
	if (receiver === null) {
		return;
	}
	if (analysis.silent) {
		return;
	}
	analysis.unit.unclassified.push({
		router: receiver.router,
		member: member.name,
		arity: member.args.length,
		call,
		relPath: analysis.relPath,
	});
}

export type Member = {
	readonly name: string;
	readonly receiver: SyntaxNode;
	readonly args: readonly SyntaxNode[];
};

function memberOf(call: SyntaxNode): Member | null {
	const callee = call.childForFieldName("function");
	if (callee === null || callee.type !== "selector_expression") {
		return null;
	}
	const field = callee.childForFieldName("field");
	const receiver = callee.childForFieldName("operand");
	if (field === null || receiver === null) {
		return null;
	}
	return { name: field.text, receiver, args: argumentsOf(call) };
}

function argumentsOf(call: SyntaxNode): readonly SyntaxNode[] {
	return call.childForFieldName("arguments")?.namedChildren ?? [];
}

function recordRegistration(
	call: SyntaxNode,
	member: Member,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const value = evaluate(member.receiver, scope, analysis);
	if (value === null) {
		return false;
	}
	if (analysis.silent) {
		return true;
	}
	analysis.unit.registrations.push({
		value,
		path: foldGoValue(
			argumentFor(value.router.pathArg, member.args, NO_KEYWORDS),
			resolverOf(scope, analysis),
		),
		method: { kind: "literal", value: member.name.toUpperCase() },
		call,
		relPath: analysis.relPath,
		distance: analysis.depth,
	});
	return true;
}

/**
 * The standard-library multiplexer carries the method inside its pattern and
 * mounts a router handed to it as a handler, so one member is both of the forms
 * chi spells with two. See project-map:BEH-020.
 */
function recordMuxRegistration(
	call: SyntaxNode,
	member: Member,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const value = evaluate(member.receiver, scope, analysis);
	if (value === null || !goOriginMatches(MUX_ORIGIN, value.router.dsl)) {
		return false;
	}
	const pattern = muxPattern(
		foldGoValue(member.args[0] ?? null, resolverOf(scope, analysis)),
	);
	const mounted = evaluate(member.args[1] ?? null, scope, analysis);
	if (mounted !== null && mounted.identity.kind === "proven") {
		addMount(analysis, mounted.identity.key, {
			prefix: pattern.path,
			parent: value.identity.kind === "proven" ? value.identity.key : null,
		});
		return true;
	}
	if (analysis.silent) {
		return true;
	}
	for (const method of pattern.methods) {
		analysis.unit.registrations.push({
			value,
			path: pattern.path,
			method,
			call,
			relPath: analysis.relPath,
			distance: analysis.depth,
		});
	}
	return true;
}

/**
 * A mount on a proven router claims its call whatever the sub-router resolved
 * to: abandoning it would descend into the arguments a second time, and losing
 * it silently would publish every route below at a bare path.
 */
function recordMount(
	call: SyntaxNode,
	member: Member,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const parent = evaluate(member.receiver, scope, analysis);
	if (parent === null) {
		return false;
	}
	const mounted = evaluate(member.args[1] ?? null, scope, analysis);
	if (mounted === null || mounted.identity.kind !== "proven") {
		if (!analysis.silent) {
			analysis.unit.lostMounts.push({
				router: parent.router,
				member: member.name,
				arity: member.args.length,
				call,
				relPath: analysis.relPath,
			});
		}
		return true;
	}
	addMount(analysis, mounted.identity.key, {
		prefix: foldGoValue(member.args[0] ?? null, resolverOf(scope, analysis)),
		parent: parent.identity.kind === "proven" ? parent.identity.key : null,
	});
	return true;
}

function addMount(
	analysis: Analysis,
	identity: string,
	record: MountRecord,
): void {
	if (analysis.silent) {
		return;
	}
	const recorded = analysis.unit.mounts.get(identity) ?? [];
	if (recorded.some((entry) => sameMount(entry, record))) {
		return;
	}
	analysis.unit.mounts.set(identity, [...recorded, record]);
}

/**
 * One mount site recorded twice is one mount. A body reached again along a
 * shorter path re-walks it, and an appended duplicate would read as a value
 * mounted twice.
 */
function sameMount(left: MountRecord, right: MountRecord): boolean {
	return left.parent === right.parent && jcs(left.prefix) === jcs(right.prefix);
}

/** Reads a package constant, and a field of a record the caller proved. */
function resolverOf(scope: Scope, analysis: Analysis): GoValueResolver {
	return (node) => {
		if (node.type === "identifier") {
			return constantValue(node.text, analysis);
		}
		if (node.type !== "selector_expression") {
			return null;
		}
		const operand = node.childForFieldName("operand");
		const field = node.childForFieldName("field");
		if (operand?.type !== "identifier" || field === null) {
			return null;
		}
		const record = scope.records.get(operand.text);
		return record === undefined
			? qualifiedConstant(operand.text, field.text, analysis)
			: fieldValue(record, field.text, analysis);
	};
}

function fieldValue(
	record: RouterRecord,
	name: string,
	analysis: Analysis,
): ValueIr | null {
	const found = record.get(name);
	if (found === undefined) {
		return null;
	}
	if (found.kind === "zero") {
		return zeroValueOf(found.goType);
	}
	if (found.kind === "router") {
		return { kind: "unknown", reason: "dynamic" };
	}
	const inside: Analysis = {
		...analysis,
		imports: found.imports,
		directory: found.directory,
	};
	return foldGoValue(found.node, resolverOf(freshScope(), inside));
}

function constantValue(name: string, analysis: Analysis): ValueIr | null {
	const bound = analysis.unit.packages
		.at(analysis.directory)
		?.declarations.constOf(name);
	return bound === undefined || bound === null ? null : foldGoValue(bound);
}

function qualifiedConstant(
	qualifier: string,
	name: string,
	analysis: Analysis,
): ValueIr | null {
	const importPath = analysis.imports.pathOf(qualifier);
	if (importPath === null) {
		return null;
	}
	const bound = analysis.unit.packages
		.forImport(importPath)
		?.declarations.constOf(name);
	return bound === undefined || bound === null ? null : foldGoValue(bound);
}

function evaluate(
	node: SyntaxNode | null,
	scope: Scope,
	analysis: Analysis,
): RouterValue | null {
	if (node === null) {
		return null;
	}
	if (node.type === "parenthesized_expression") {
		return evaluate(node.namedChildren[0] ?? null, scope, analysis);
	}
	if (node.type === "identifier") {
		return scope.bindings.get(node.text) ?? null;
	}
	if (node.type === "selector_expression") {
		return recordField(node, scope);
	}
	if (node.type !== "call_expression") {
		return null;
	}
	return evaluateCall(node, scope, analysis);
}

function recordField(node: SyntaxNode, scope: Scope): RouterValue | null {
	const operand = node.childForFieldName("operand");
	const field = node.childForFieldName("field");
	if (operand?.type !== "identifier" || field === null) {
		return null;
	}
	const found = scope.records.get(operand.text)?.get(field.text);
	return found !== undefined && found.kind === "router" ? found.value : null;
}

function evaluateCall(
	call: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): RouterValue | null {
	const constructed = constructorValue(call, analysis);
	if (constructed !== null) {
		return constructed;
	}
	const member = memberOf(call);
	const propagated =
		member === null ? null : propagateIdentity(call, member, scope, analysis);
	if (propagated !== null) {
		return propagated;
	}
	followEdge(call, scope, analysis);
	return lostThroughHelper(call, scope, analysis);
}

/**
 * A call claims a router only when its callee's package resolves to the
 * declared origin. A qualifier that merely reads like a router framework
 * resolves nowhere and constructs nothing.
 */
function constructorValue(
	call: SyntaxNode,
	analysis: Analysis,
): RouterValue | null {
	const member = memberOf(call);
	if (member === null || !CONSTRUCTORS.has(member.name)) {
		return null;
	}
	if (member.receiver.type !== "identifier") {
		return null;
	}
	const importPath = analysis.imports.pathOf(member.receiver.text);
	if (importPath === null) {
		return null;
	}
	const router = analysis.unit.routers.find((candidate) =>
		goOriginMatches(candidate.dsl, importPath),
	);
	if (router === undefined) {
		return null;
	}
	return {
		router,
		identity: { kind: "proven", key: `${analysis.relPath}#${call.startIndex}` },
	};
}

/**
 * Enters the declaration a call names, once per distinct seed, binding its
 * parameters to the router values and records the call site proved.
 */
function followEdge(
	call: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): RouterValue | null {
	const callee = calleeOf(call, {
		imports: analysis.imports,
		directory: analysis.directory,
		packages: analysis.unit.packages,
		scope: enclosingOf(call),
	});
	if (callee === null) {
		return null;
	}
	const seeds = seedsOf(call, scope, analysis);
	if (seeds.length === 0) {
		return null;
	}
	if (analysis.depth >= MAX_CALL_EDGES) {
		enterBody(callee, seeds.map(refuse), analysis);
		return refused(seeds);
	}
	enterBody(callee, seeds, analysis);
	return null;
}

/* The site is claimed whatever the budget; what the budget bounds is whether a
 * proven identity crosses the edge. */
function refuse(seed: Seed): Seed {
	return {
		index: seed.index,
		value: seed.value === null ? null : refuseValue(seed.value),
		record: seed.record === null ? null : refuseRecord(seed.record),
	};
}

function refuseValue(value: RouterValue): RouterValue {
	return { router: value.router, identity: LOST("depth_exceeded") };
}

function refuseRecord(record: RouterRecord): RouterRecord {
	const fields = new Map<string, FieldValue>();
	for (const [name, field] of record) {
		fields.set(
			name,
			field.kind === "router"
				? { kind: "router", value: refuseValue(field.value) }
				: field,
		);
	}
	return fields;
}

type Seed = {
	readonly index: number;
	readonly value: RouterValue | null;
	readonly record: RouterRecord | null;
};

function refused(seeds: readonly Seed[]): RouterValue | null {
	for (const seed of seeds) {
		if (seed.value !== null) {
			return {
				router: seed.value.router,
				identity: LOST("depth_exceeded"),
			};
		}
	}
	return null;
}

function seedsOf(
	call: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): readonly Seed[] {
	const seeds: Seed[] = [];
	argumentsOf(call).forEach((argument, index) => {
		const value = evaluate(argument, scope, analysis);
		const record =
			value !== null ? null : recordArgument(argument, scope, analysis);
		if (value !== null || record !== null) {
			seeds.push({ index, value, record });
		}
	});
	return seeds;
}

function recordArgument(
	argument: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): RouterRecord | null {
	if (argument.type === "identifier") {
		return scope.records.get(argument.text) ?? null;
	}
	return recordOf(argument, {
		imports: analysis.imports,
		directory: analysis.directory,
		packages: analysis.unit.packages,
		routerOf: (node) => evaluate(node, scope, analysis),
	});
}

function enterBody(
	callee: CalleeDeclaration,
	seeds: readonly Seed[],
	analysis: Analysis,
): void {
	const bodyKey = `${callee.relPath}#${callee.declaration.startIndex}`;
	const key = `${bodyKey}#${seedSignature(seeds)}`;
	const distance = analysis.depth + 1;
	const reached = analysis.unit.enteredAt.get(key);
	if (reached !== undefined && reached <= distance) {
		return;
	}
	analysis.unit.enteredAt.set(key, distance);
	analysis.unit.entered.add(bodyKey);
	const inner: Analysis = {
		unit: analysis.unit,
		imports: callee.imports,
		relPath: callee.relPath,
		directory: callee.directory,
		depth: analysis.depth + 1,
		silent: analysis.silent,
	};
	const scope = freshScope();
	const parameters = parametersOf(callee.declaration);
	for (const seed of seeds) {
		const parameter = parameters[seed.index];
		if (parameter === undefined) {
			continue;
		}
		bindSeed(parameter.name, seed, scope);
	}
	const body = callee.declaration.childForFieldName("body");
	if (body !== null) {
		visitChildren(body, scope, inner);
	}
}

function bindSeed(name: string, seed: Seed, scope: Scope): void {
	if (seed.value !== null) {
		scope.bindings.set(name, seed.value);
		scope.defined.add(name);
	}
	if (seed.record !== null) {
		scope.records.set(name, seed.record);
	}
}

function enclosingOf(call: SyntaxNode): SyntaxNode {
	let cursor: SyntaxNode | null | undefined = call.parent;
	while (cursor !== null && cursor !== undefined) {
		if (
			cursor.type === "function_declaration" ||
			cursor.type === "method_declaration"
		) {
			return cursor;
		}
		cursor = cursor.parent;
	}
	return call;
}

function propagateIdentity(
	call: SyntaxNode,
	member: Member,
	scope: Scope,
	analysis: Analysis,
): RouterValue | null {
	const receiver = evaluate(member.receiver, scope, analysis);
	const builtIn = BUILT_INS.find((entry) => entry.member === member.name);
	if (builtIn !== undefined && receiver !== null) {
		return applyBuiltIn(call, member, receiver, { builtIn, scope, analysis });
	}
	return applyDeclared(member, scope, analysis, receiver);
}

type BuiltInContext = {
	readonly builtIn: BuiltInMember;
	readonly scope: Scope;
	readonly analysis: Analysis;
};

function applyBuiltIn(
	call: SyntaxNode,
	member: Member,
	receiver: RouterValue,
	context: BuiltInContext,
): RouterValue {
	const { builtIn, scope, analysis } = context;
	const value = derivedValue(call, receiver, builtIn, member, analysis);
	if (builtIn.closureArg !== null) {
		bindClosure(
			member.args[builtIn.closureArg] ?? null,
			value,
			scope,
			analysis,
		);
	}
	return value;
}

/**
 * A member carrying a pattern mounts a fresh router on its receiver; one
 * without a pattern hands the receiver's own identity on unchanged.
 */
function derivedValue(
	call: SyntaxNode,
	receiver: RouterValue,
	builtIn: BuiltInMember,
	member: Member,
	analysis: Analysis,
): RouterValue {
	if (builtIn.prefixArg === null || receiver.identity.kind !== "proven") {
		return receiver;
	}
	const key = `${analysis.relPath}#${call.startIndex}`;
	addMount(analysis, key, {
		prefix: foldGoValue(member.args[builtIn.prefixArg] ?? null),
		parent: receiver.identity.key,
	});
	return { router: receiver.router, identity: { kind: "proven", key } };
}

function applyDeclared(
	member: Member,
	scope: Scope,
	analysis: Analysis,
	receiver: RouterValue | null,
): RouterValue | null {
	for (const router of analysis.unit.routers) {
		const entry = router.identityPreserving.find(
			(candidate) => candidate.member === member.name,
		);
		if (entry === undefined) {
			continue;
		}
		const source =
			entry.from === "receiver"
				? receiver
				: evaluate(member.args[entry.index ?? 0] ?? null, scope, analysis);
		if (source === null) {
			continue;
		}
		if (entry.binds !== null) {
			bindClosure(member.args[0] ?? null, source, scope, analysis);
		}
		return source;
	}
	return null;
}

function bindClosure(
	literal: SyntaxNode | null,
	value: RouterValue,
	scope: Scope,
	analysis: Analysis,
): void {
	if (literal === null || literal.type !== "func_literal") {
		return;
	}
	const inner = childScope(scope);
	const parameter = literal
		.childForFieldName("parameters")
		?.namedChildren[0]?.childForFieldName("name");
	if (parameter !== null && parameter !== undefined) {
		inner.bindings.set(parameter.text, value);
		inner.defined.add(parameter.text);
	}
	visitLiteral(literal, inner, analysis);
}

/**
 * A router handed to a member nobody declared comes back with its lineage
 * lost, which is a router of unresolved identity rather than no router.
 */
function lostThroughHelper(
	call: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): RouterValue | null {
	for (const argument of argumentsOf(call)) {
		const value = evaluate(argument, scope, analysis);
		if (value !== null) {
			return { router: value.router, identity: LOST("dynamic") };
		}
	}
	return null;
}
