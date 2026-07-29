import type { ValueIr } from "../../../../core/domain/facts/value-ir.js";
import type { DeclaredRouter } from "../../../../core/ports/config.port.js";
import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";
import { type GoImportIndex, goOriginMatches } from "../../index/go/imports.js";
import { foldGoValue } from "../../value/go-value.js";
import { argumentFor } from "../argument-selector.js";

/* Go has no keyword arguments, so a keyword selector names nothing here. */
const NO_KEYWORDS = new Map<string, SyntaxNode>();

const CONSTRUCTORS = new Set(["NewRouter", "NewMux"]);

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

/** A router value; a null identity is a router whose lineage was lost. */
export type RouterValue = {
	readonly router: DeclaredRouter;
	readonly identity: string | null;
};

export type Registration = {
	readonly value: RouterValue;
	readonly pathNode: SyntaxNode | null;
	readonly method: string;
	readonly call: SyntaxNode;
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
};

export type ScopeResult = {
	readonly registrations: readonly Registration[];
	readonly mounts: ReadonlyMap<string, readonly MountRecord[]>;
	readonly unclassified: readonly UnclassifiedRegistration[];
};

type Analysis = {
	readonly imports: GoImportIndex;
	readonly routers: readonly DeclaredRouter[];
	readonly relPath: string;
	readonly registrations: Registration[];
	readonly mounts: Map<string, MountRecord[]>;
	readonly unclassified: UnclassifiedRegistration[];
};

type Scope = {
	readonly bindings: Map<string, RouterValue>;
	readonly defined: Set<string>;
};

/**
 * Binds every router value a file constructs and attributes each registration
 * to the value its receiver resolves to. Resolution is intraprocedural: a
 * function body, and each function literal nested in one, is a scope.
 */
export function analyzeGoRouterValues(
	file: ParsedFile,
	imports: GoImportIndex,
	routers: readonly DeclaredRouter[],
): ScopeResult {
	const analysis: Analysis = {
		imports,
		routers,
		relPath: file.relPath,
		registrations: [],
		mounts: new Map(),
		unclassified: [],
	};
	for (const declaration of rootOf(file.tree).namedChildren) {
		const body = declaration.childForFieldName("body");
		if (body !== null) {
			visitChildren(body, freshScope(), analysis);
		}
	}
	return {
		registrations: analysis.registrations,
		mounts: analysis.mounts,
		unclassified: analysis.unclassified,
	};
}

function freshScope(): Scope {
	return { bindings: new Map(), defined: new Set() };
}

function childScope(scope: Scope): Scope {
	return {
		bindings: new Map(scope.bindings),
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
	if (bindDefinition(node, scope, analysis)) {
		return;
	}
	if (node.type === "call_expression" && classifyCall(node, scope, analysis)) {
		return;
	}
	visitChildren(node, scope, analysis);
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
		previous.identity === value.identity
	) {
		return;
	}
	const router = value?.router ?? previous?.router;
	if (router !== undefined) {
		scope.bindings.set(name, { router, identity: null });
	}
}

function classifyCall(
	call: SyntaxNode,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const member = memberOf(call);
	if (member === null) {
		return false;
	}
	if (VERBS.has(member.name)) {
		return recordRegistration(call, member, scope, analysis);
	}
	if (member.name === MOUNT) {
		return recordMount(member, scope, analysis);
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
	analysis.unclassified.push({
		router: receiver.router,
		member: member.name,
		arity: member.args.length,
		call,
	});
}

type Member = {
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
	analysis.registrations.push({
		value,
		pathNode: argumentFor(value.router.pathArg, member.args, NO_KEYWORDS),
		method: member.name.toUpperCase(),
		call,
	});
	return true;
}

function recordMount(
	member: Member,
	scope: Scope,
	analysis: Analysis,
): boolean {
	const mounted = evaluate(member.args[1] ?? null, scope, analysis);
	if (mounted === null || mounted.identity === null) {
		return false;
	}
	const parent = evaluate(member.receiver, scope, analysis);
	addMount(analysis, mounted.identity, {
		prefix: foldGoValue(member.args[0] ?? null),
		parent: parent?.identity ?? null,
	});
	return true;
}

function addMount(
	analysis: Analysis,
	identity: string,
	record: MountRecord,
): void {
	analysis.mounts.set(identity, [
		...(analysis.mounts.get(identity) ?? []),
		record,
	]);
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
	if (node.type !== "call_expression") {
		return null;
	}
	return evaluateCall(node, scope, analysis);
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
	const router = analysis.routers.find((candidate) =>
		goOriginMatches(candidate.dsl, importPath),
	);
	if (router === undefined) {
		return null;
	}
	return { router, identity: `${analysis.relPath}#${call.startIndex}` };
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
	if (builtIn.prefixArg === null || receiver.identity === null) {
		return receiver;
	}
	const identity = `${analysis.relPath}#${call.startIndex}`;
	addMount(analysis, identity, {
		prefix: foldGoValue(member.args[builtIn.prefixArg] ?? null),
		parent: receiver.identity,
	});
	return { router: receiver.router, identity };
}

function applyDeclared(
	member: Member,
	scope: Scope,
	analysis: Analysis,
	receiver: RouterValue | null,
): RouterValue | null {
	for (const router of analysis.routers) {
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
			return { router: value.router, identity: null };
		}
	}
	return null;
}
