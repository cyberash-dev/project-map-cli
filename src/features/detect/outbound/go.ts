import type { Diagnostic } from "../../../core/domain/facts/diagnostic.js";
import type { AnalysisUnit } from "../../../core/ports/analysis-unit.port.js";
import type { DeclaredSink } from "../../../core/ports/config.port.js";
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
import { goImportIndex } from "../index/go/imports.js";
import { type GoPackageIndex, goPackageIndex } from "../index/go/packages.js";
import { canonicalPathIr } from "../openapi/path-grammar.js";
import { type RecordValue, recordsOf } from "../value/record.js";
import { splitAbsoluteUrl } from "./absolute-url.js";
import {
	constructorSummary,
	foldGoSinkValue,
	type GoModule,
	goAncestry,
	goConfigFold,
	goModulesOf,
	goOriginClaims,
	resolveChain,
} from "./go-scope.js";
import { type DraftOutboundFact, outboundDraft } from "./ladder.js";
import type { OutboundResult } from "./python.js";
import { bindingOf, callOfMember } from "./sinks.js";
import { resolveDestinations } from "./target-binding.js";

export type GoOutboundRequest = {
	readonly unit: AnalysisUnit;
	readonly parser: ISourceParser;
	readonly sinks: readonly DeclaredSink[];
};

type Context = {
	readonly module: GoModule;
	readonly packages: GoPackageIndex;
	readonly constructions: ReadonlyMap<string, readonly Construction[]>;
	readonly offsets: ReturnType<typeof byteOffsetTable>;
};

/**
 * Outbound calls written against a declared sink whose sending members take a
 * record. The receiver claims the sink through Go embedding, and the method and
 * path come off the record fields the caller assigned.
 */
export function detectGoOutbound(request: GoOutboundRequest): OutboundResult {
	if (request.sinks.length === 0) {
		return { facts: [], diagnostics: [] };
	}
	const files = parseFiles(request);
	const packages = goPackageIndex(files);
	const modules = goModulesOf(files, goImportIndex);
	const constructions = constructionIndex(modules, packages);
	const facts: DraftOutboundFact[] = [];
	for (const module of modules) {
		const context = {
			module,
			packages,
			constructions,
			offsets: byteOffsetTable(module.file.content),
		};
		facts.push(...factsOfModule(context, request.sinks));
	}
	return { facts, diagnostics: [] };
}

function parseFiles(request: GoOutboundRequest): readonly ParsedFile[] {
	const files: ParsedFile[] = [];
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
		if (file !== null) {
			files.push(file);
		}
	}
	return files;
}

/**
 * A call to a package function whose declared result is a type constructs that
 * type as observably as a composite literal does, which is what the
 * owner_construction step of project-map:BEH-011 collects.
 */
function constructionIndex(
	modules: readonly GoModule[],
	packages: GoPackageIndex,
): ReadonlyMap<string, readonly Construction[]> {
	const byType = new Map<string, Construction[]>();
	for (const module of modules) {
		for (const call of findAll(
			rootOf(module.file.tree),
			(node) => node.type === "call_expression",
		)) {
			const key = constructedType(call, module, packages);
			if (key !== null) {
				byType.set(key, [...(byType.get(key) ?? []), { call, module }]);
			}
		}
	}
	return byType;
}

export type Construction = {
	readonly call: SyntaxNode;
	readonly module: GoModule;
};

function constructedType(
	call: SyntaxNode,
	module: GoModule,
	packages: GoPackageIndex,
): string | null {
	const callee = call.childForFieldName("function");
	if (callee === null) {
		return null;
	}
	if (callee.type === "identifier") {
		const result = packages
			.at(module.directory)
			?.declarations.resultOf(callee.text);
		return result === null || result === undefined
			? null
			: `${module.directory}.${result}`;
	}
	if (callee.type !== "selector_expression") {
		return null;
	}
	const operand = callee.childForFieldName("operand");
	const field = callee.childForFieldName("field");
	if (operand?.type !== "identifier" || field === null) {
		return null;
	}
	const importPath = module.imports.pathOf(operand.text);
	const target = importPath === null ? null : packages.forImport(importPath);
	const result = target?.declarations.resultOf(field.text) ?? null;
	return result === null ? null : `${target?.directory}.${result}`;
}

function factsOfModule(
	context: Context,
	sinks: readonly DeclaredSink[],
): readonly DraftOutboundFact[] {
	const facts: DraftOutboundFact[] = [];
	for (const method of findAll(
		rootOf(context.module.file.tree),
		(node) => node.type === "method_declaration",
	)) {
		facts.push(...factsOfMethod(method, context, sinks));
	}
	return facts;
}

type Receiver = {
	readonly name: string;
	readonly type: string;
};

function factsOfMethod(
	method: SyntaxNode,
	context: Context,
	sinks: readonly DeclaredSink[],
): readonly DraftOutboundFact[] {
	const receiver = receiverOf(method);
	const body = method.childForFieldName("body");
	if (receiver === null || body === null) {
		return [];
	}
	const ancestors = goAncestry(receiver.type, context.module, context.packages);
	const sink = sinks.find((entry) => goOriginClaims(ancestors, entry.baseType));
	if (sink === undefined) {
		return [];
	}
	const seeded = new Map<SyntaxNode, string>();
	const records = recordsOf(body, (value) => {
		const summary = constructorSummary(value, {
			module: context.module,
			packages: context.packages,
		});
		for (const bound of summary.fields.values()) {
			if (summary.directory !== null) {
				seeded.set(bound, summary.directory);
			}
		}
		return summary.fields;
	});
	const owner = `${receiver.type}.${method.childForFieldName("name")?.text ?? ""}`;
	return findAll(body, (node) => node.type === "call_expression")
		.map((call) =>
			factOfCall(
				{ call, receiver, sink, records, owner, seeded },
				context,
				ancestors,
			),
		)
		.filter((fact): fact is DraftOutboundFact => fact !== null);
}

function receiverOf(method: SyntaxNode): Receiver | null {
	const declaration = method.namedChildren[0]?.namedChildren[0];
	if (
		declaration === undefined ||
		declaration.type !== "parameter_declaration"
	) {
		return null;
	}
	const name = declaration.childForFieldName("name");
	const type = declaration.childForFieldName("type");
	if (name === null || type === null) {
		return null;
	}
	return {
		name: name.text,
		type: type.text.startsWith("*") ? type.text.slice(1) : type.text,
	};
}

type Site = {
	readonly call: SyntaxNode;
	readonly receiver: Receiver;
	readonly sink: DeclaredSink;
	readonly records: ReadonlyMap<string, RecordValue>;
	readonly owner: string;
	/** Nodes a constructor summary supplied, with the package that wrote them. */
	readonly seeded: ReadonlyMap<SyntaxNode, string>;
};

function factOfCall(
	site: Site,
	context: Context,
	ancestors: ReturnType<typeof goAncestry>,
): DraftOutboundFact | null {
	const callee = site.call.childForFieldName("function");
	if (callee === null || callee.type !== "selector_expression") {
		return null;
	}
	if (callee.childForFieldName("operand")?.text !== site.receiver.name) {
		return null;
	}
	const member = callee.childForFieldName("field")?.text ?? "";
	const call = callOfMember(site.sink, member);
	if (call === null) {
		return null;
	}
	return draftOf(site, { sink: site.sink, call }, context, ancestors);
}

function draftOf(
	site: Site,
	match: {
		readonly sink: DeclaredSink;
		readonly call: ReturnType<typeof callOfMember>;
	},
	context: Context,
	ancestors: ReturnType<typeof goAncestry>,
): DraftOutboundFact {
	const args = site.call.childForFieldName("arguments")?.namedChildren ?? [];
	const bound = { sink: match.sink, call: match.call ?? sinkless() };
	const fold = (node: SyntaxNode | null) =>
		foldGoSinkValue(node, seedContext(node, site, context));
	const split = splitAbsoluteUrl(
		fold(chain(bound, "pathArg", args, site.records)),
	);
	return outboundDraft({
		provenance: "declared",
		method: fold(chain(bound, "method", args, site.records)),
		path: canonicalPathIr([split.path]),
		destinations:
			split.destination === null
				? destinationsOf(site, bound, context, ancestors)
				: [split.destination],
		ownerOperation: site.owner,
		anchor: anchorOf(site.call, context),
	});
}

/**
 * A value a constructor summary supplied names its constants in the package
 * that declared the literal, not in the package that read it.
 */
function seedContext(node: SyntaxNode | null, site: Site, context: Context) {
	const directory = node === null ? undefined : site.seeded.get(node);
	if (directory === undefined) {
		return { module: context.module, packages: context.packages };
	}
	return {
		module: { ...context.module, directory },
		packages: context.packages,
	};
}

function sinkless() {
	return { member: "", pathArg: null, method: null, target: null };
}

function chain(
	match: Parameters<typeof bindingOf>[0],
	key: "pathArg" | "method",
	args: readonly SyntaxNode[],
	records: ReadonlyMap<string, RecordValue>,
): SyntaxNode | null {
	const selector = bindingOf(match, key);
	return selector === null ? null : resolveChain(selector, args, records);
}

function destinationsOf(
	site: Site,
	match: Parameters<typeof bindingOf>[0],
	context: Context,
	ancestors: ReturnType<typeof goAncestry>,
) {
	const constructions =
		context.constructions.get(
			`${context.module.directory}.${site.receiver.type}`,
		) ?? [];
	const owning = new Map(
		constructions.map((entry) => [entry.call.startIndex, entry.module]),
	);
	return resolveDestinations({
		selector: bindingOf(match, "target"),
		instance: null,
		isOwnInstance: true,
		ownConstructions: constructions.map((entry) => entry.call),
		declaredBindings: [],
		readable: ancestors.some((ancestor) => ancestor.declared),
		fold: (node) => goConfigFold(node, foldContext(node, owning, context)),
		argumentOf: (construction, step) =>
			step.kind === "arg" && typeof step.selector === "number"
				? (construction.childForFieldName("arguments")?.namedChildren[
						step.selector
					] ?? null)
				: null,
	});
}

/**
 * A construction elsewhere in the unit names its configuration through its own
 * imports, so the fold runs against the module that wrote it.
 */
function foldContext(
	node: SyntaxNode | null,
	owning: ReadonlyMap<number, GoModule>,
	context: Context,
) {
	for (const [start, module] of owning) {
		if (node !== null && node.startIndex >= start) {
			return { module, packages: context.packages };
		}
	}
	return { module: context.module, packages: context.packages };
}

function anchorOf(node: SyntaxNode, context: Context) {
	return {
		path: context.module.file.relPath,
		start_byte: context.offsets.byteOffsetAt(node.startIndex),
		end_byte: context.offsets.byteOffsetAt(node.endIndex),
	};
}

export type { Diagnostic };
