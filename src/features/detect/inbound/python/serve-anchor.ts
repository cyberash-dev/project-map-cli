import type { ParsedFile } from "../../../../core/ports/parser.port.js";
import {
	findAll,
	rootOf,
	type SyntaxNode,
} from "../../../../infrastructure/parser/ts-utils.js";
import {
	originMatches,
	resolveModulePath,
} from "../../index/module-resolver.js";
import type {
	PythonClass,
	PythonDeclarationIndex,
} from "../../index/python/declarations.js";
import type { PythonImportIndex } from "../../index/python/imports.js";

export type AnchorModuleView = {
	readonly file: ParsedFile;
	readonly imports: PythonImportIndex;
	readonly declarations: PythonDeclarationIndex;
};

export type ServingCall = {
	readonly symbol: string;
	readonly node: SyntaxNode;
	readonly relPath: string;
};

export type ServeAnchors = {
	/** Keys of the calls a served application transitively holds. */
	readonly anchored: ReadonlySet<string>;
	readonly unresolved: readonly ServingCall[];
};

type Modules = ReadonlyMap<string, AnchorModuleView>;

type ClassRef = {
	readonly view: AnchorModuleView;
	readonly declared: PythonClass;
};

type Bound = {
	readonly view: AnchorModuleView;
	readonly node: SyntaxNode;
};

/** Adapter knowledge: the serving entry point and the argument it serves. */
const SERVE_ENTRY_POINTS: ReadonlyMap<string, number> = new Map([
	["aiohttp.web.run_app", 0],
]);

const SEQUENCES: ReadonlySet<string> = new Set([
	"tuple",
	"list",
	"set",
	"list_splat",
	"parenthesized_expression",
]);

export function siteKey(relPath: string, node: SyntaxNode): string {
	return `${relPath}#${node.startIndex}`;
}

/**
 * The registrations a serving call reaches. Everything else the unit declares
 * is a route table nothing serves, which project-map:DLT-045 refuses to publish
 * at a path.
 */
export function pythonServeAnchors(modules: Modules): ServeAnchors {
	const anchored = new Set<string>();
	const unresolved: ServingCall[] = [];
	for (const [relPath, view] of modules) {
		for (const call of findAll(
			rootOf(view.file.tree),
			(node) => node.type === "call",
		)) {
			const entry = servingEntryPoint(call, view);
			if (entry === null) {
				continue;
			}
			const served = servedClasses(call, entry.argIndex, view, modules);
			if (served.length === 0) {
				unresolved.push({ symbol: entry.symbol, node: call, relPath });
				continue;
			}
			for (const application of served) {
				collectRegistrations(application, modules, anchored);
			}
		}
	}
	return { anchored, unresolved };
}

function servingEntryPoint(
	call: SyntaxNode,
	view: AnchorModuleView,
): { readonly symbol: string; readonly argIndex: number } | null {
	const callee = call.childForFieldName("function");
	const origin = callee === null ? null : dottedOrigin(callee, view);
	if (origin === null) {
		return null;
	}
	for (const [symbol, argIndex] of SERVE_ENTRY_POINTS) {
		if (originMatches(symbol, origin)) {
			return { symbol, argIndex };
		}
	}
	return null;
}

/** The dotted origin a callee resolves to, following the module it came from. */
function dottedOrigin(node: SyntaxNode, view: AnchorModuleView): string | null {
	if (node.type === "identifier") {
		if (view.imports.isShadowedLocally(node.text)) {
			return null;
		}
		return view.imports.originOf(node.text) ?? view.imports.moduleOf(node.text);
	}
	if (node.type !== "attribute") {
		return null;
	}
	const object = node.childForFieldName("object");
	const attribute = node.childForFieldName("attribute");
	if (object === null || attribute === null) {
		return null;
	}
	const base = dottedOrigin(object, view);
	return base === null ? null : `${base}.${attribute.text}`;
}

function servedClasses(
	call: SyntaxNode,
	argIndex: number,
	view: AnchorModuleView,
	modules: Modules,
): readonly ClassRef[] {
	const args = call.childForFieldName("arguments");
	const positional = (args?.namedChildren ?? []).filter(
		(node) => node.type !== "keyword_argument",
	);
	const target = positional[argIndex];
	if (target === undefined) {
		return [];
	}
	if (target.type === "call") {
		const constructed = constructedClass(target, view, modules);
		return constructed === null ? [] : [constructed];
	}
	if (target.type !== "identifier") {
		return [];
	}
	return boundClasses(target.text, call, view, modules);
}

function constructedClass(
	call: SyntaxNode,
	view: AnchorModuleView,
	modules: Modules,
): ClassRef | null {
	const callee = call.childForFieldName("function");
	if (callee === null || callee.type !== "identifier") {
		return null;
	}
	return resolveClass(callee.text, view, modules);
}

/**
 * Every class the enclosing body binds the name to. A body binding it in
 * several branches serves each of them, so none of them wins over another.
 */
function boundClasses(
	name: string,
	call: SyntaxNode,
	view: AnchorModuleView,
	modules: Modules,
): readonly ClassRef[] {
	const found: ClassRef[] = [];
	for (const assignment of findAll(
		enclosingBody(rootOf(view.file.tree), call),
		(node) => node.type === "assignment",
	)) {
		const left = assignment.childForFieldName("left");
		const right = assignment.childForFieldName("right");
		if (left?.text !== name || right === null || right.type !== "call") {
			continue;
		}
		const constructed = constructedClass(right, view, modules);
		if (constructed !== null) {
			found.push(constructed);
		}
	}
	return found;
}

function enclosingBody(root: SyntaxNode, call: SyntaxNode): SyntaxNode {
	let innermost = root;
	for (const declaration of findAll(
		root,
		(node) => node.type === "function_definition",
	)) {
		const contains =
			declaration.startIndex <= call.startIndex &&
			call.endIndex <= declaration.endIndex;
		if (contains && declaration.startIndex >= innermost.startIndex) {
			innermost = declaration;
		}
	}
	return innermost;
}

function resolveClass(
	name: string,
	view: AnchorModuleView,
	modules: Modules,
): ClassRef | null {
	const local = view.declarations.classOf(name);
	if (local !== null) {
		return { view, declared: local };
	}
	const imported = followImport(name, view, modules);
	if (imported === null) {
		return null;
	}
	const declared = imported.view.declarations.classOf(imported.name);
	return declared === null ? null : { view: imported.view, declared };
}

function followImport(
	name: string,
	view: AnchorModuleView,
	modules: Modules,
): { readonly view: AnchorModuleView; readonly name: string } | null {
	const origin = view.imports.originOf(name);
	const lastDot = origin === null ? -1 : origin.lastIndexOf(".");
	if (origin === null || lastDot < 0) {
		return null;
	}
	const modulePath = resolveModulePath(
		origin.slice(0, lastDot),
		[...modules.keys()].map((path) => ({ path, text: "" })),
	);
	const found = modulePath === null ? undefined : modules.get(modulePath);
	return found === undefined
		? null
		: { view: found, name: origin.slice(lastDot + 1) };
}

function collectRegistrations(
	application: ClassRef,
	modules: Modules,
	anchored: Set<string>,
): void {
	const seen = new Set<string>();
	for (const bound of attributesOf(application, modules).values()) {
		fold(bound, modules, anchored, seen);
	}
}

/**
 * The attributes the class reads, first binding in method-resolution order
 * winning, so an attribute a subclass rebinds no longer reaches the base value.
 */
function attributesOf(
	application: ClassRef,
	modules: Modules,
): ReadonlyMap<string, Bound> {
	const attributes = new Map<string, Bound>();
	for (const ancestor of resolutionOrder(application, modules)) {
		for (const [name, node] of ancestor.declared.constants) {
			if (!attributes.has(name)) {
				attributes.set(name, { view: ancestor.view, node });
			}
		}
	}
	return attributes;
}

function resolutionOrder(
	application: ClassRef,
	modules: Modules,
): readonly ClassRef[] {
	const order: ClassRef[] = [];
	const seen = new Set<string>();
	const walk = (current: ClassRef): void => {
		const key = `${current.view.file.relPath}#${current.declared.name}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		order.push(current);
		for (const base of current.declared.bases) {
			const resolved = resolveClass(base, current.view, modules);
			if (resolved !== null) {
				walk(resolved);
			}
		}
	};
	walk(application);
	return order;
}

/**
 * Folds a class attribute to the registrations it transitively contains. An
 * expression outside the modelled forms contributes nothing, which leaves the
 * registrations it holds unanchored rather than anchoring them unproven.
 */
function fold(
	bound: Bound,
	modules: Modules,
	anchored: Set<string>,
	seen: Set<string>,
): void {
	const { view, node } = bound;
	const key = `${view.file.relPath}#${node.startIndex}#${node.endIndex}`;
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	if (node.type === "call") {
		anchored.add(siteKey(view.file.relPath, node));
		return;
	}
	for (const next of operandsOf(bound, modules)) {
		fold(next, modules, anchored, seen);
	}
}

function operandsOf(bound: Bound, modules: Modules): readonly Bound[] {
	const { view, node } = bound;
	if (SEQUENCES.has(node.type)) {
		return node.namedChildren.map((child) => ({ view, node: child }));
	}
	if (node.type === "binary_operator") {
		return sumOperands(bound);
	}
	if (node.type === "identifier") {
		const constant = moduleConstant(node.text, view, modules);
		return constant === null ? [] : [constant];
	}
	if (node.type === "attribute") {
		const owned = classAttribute(bound, modules);
		return owned === null ? [] : [owned];
	}
	return [];
}

function sumOperands(bound: Bound): readonly Bound[] {
	const { view, node } = bound;
	if (node.childForFieldName("operator")?.text !== "+") {
		return [];
	}
	const left = node.childForFieldName("left");
	const right = node.childForFieldName("right");
	return [left, right]
		.filter((operand): operand is SyntaxNode => operand !== null)
		.map((operand) => ({ view, node: operand }));
}

function classAttribute(bound: Bound, modules: Modules): Bound | null {
	const object = bound.node.childForFieldName("object");
	const attribute = bound.node.childForFieldName("attribute");
	if (object === null || attribute === null || object.type !== "identifier") {
		return null;
	}
	const owner = resolveClass(object.text, bound.view, modules);
	if (owner === null) {
		return null;
	}
	return attributesOf(owner, modules).get(attribute.text) ?? null;
}

function moduleConstant(
	name: string,
	view: AnchorModuleView,
	modules: Modules,
): Bound | null {
	const local = moduleConstants(view).get(name);
	if (local !== undefined) {
		return { view, node: local };
	}
	const imported = followImport(name, view, modules);
	if (imported === null) {
		return null;
	}
	const found = moduleConstants(imported.view).get(imported.name);
	return found === undefined ? null : { view: imported.view, node: found };
}

function moduleConstants(
	view: AnchorModuleView,
): ReadonlyMap<string, SyntaxNode> {
	const constants = new Map<string, SyntaxNode>();
	for (const statement of rootOf(view.file.tree).namedChildren) {
		if (statement.type !== "expression_statement") {
			continue;
		}
		for (const child of statement.namedChildren) {
			readAssignment(child, constants);
		}
	}
	return constants;
}

function readAssignment(
	node: SyntaxNode,
	constants: Map<string, SyntaxNode>,
): void {
	if (node.type !== "assignment") {
		return;
	}
	const target = node.childForFieldName("left");
	const value = node.childForFieldName("right");
	if (target !== null && value !== null && target.type === "identifier") {
		constants.set(target.text, value);
	}
}
