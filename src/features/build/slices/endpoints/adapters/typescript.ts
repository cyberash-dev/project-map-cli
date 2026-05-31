import type {
	Endpoint,
	HttpMethod,
	SourceLocation,
} from "../../../../../core/domain/project-map.js";
import type { Language } from "../../../../../core/domain/language.js";
import {
	findAll,
	line1Based,
	rootOf,
	type SyntaxNode,
} from "../../../../../infrastructure/parser/ts-utils.js";
import type { ExtractionContext } from "../../../extraction-context.js";
import type { ILanguageAdapter } from "../../../extractor.port.js";
import { FACTORIES_BY_FRAMEWORK, isTsFramework } from "./ts-factories.js";

const HTTP_METHODS: ReadonlySet<string> = new Set([
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options",
]);

export class TypeScriptEndpointsAdapter implements ILanguageAdapter<
	Endpoint[]
> {
	constructor(public readonly language: Language) {}

	extract(ctx: ExtractionContext): Promise<Endpoint[]> {
		const frameworks = new Set<string>(
			[
				...(ctx.config.endpoints.framework
					? [ctx.config.endpoints.framework]
					: []),
				...ctx.config.project.frameworks,
			].filter(isTsFramework),
		);
		if (frameworks.size === 0) {
			return Promise.resolve([]);
		}

		const allowedFactories = new Set<string>(
			[...frameworks].flatMap((f) => FACTORIES_BY_FRAMEWORK[f] ?? []),
		);
		const appVarWhitelist = ctx.config.endpoints.appVar
			? new Set<string>([ctx.config.endpoints.appVar])
			: null;

		const endpoints: Endpoint[] = [];
		for (const file of ctx.files) {
			if (file.language !== this.language) {
				continue;
			}
			const root = rootOf(file.tree);
			for (const call of findAll(root, (n) => n.type === "call_expression")) {
				const endpoint = endpointFromCall(
					call,
					file.relPath,
					ctx,
					allowedFactories,
					appVarWhitelist,
				);
				if (endpoint) {
					endpoints.push(endpoint);
				}
			}
		}
		return Promise.resolve(endpoints);
	}
}

function endpointFromCall(
	call: SyntaxNode,
	relPath: string,
	ctx: ExtractionContext,
	allowedFactories: ReadonlySet<string>,
	appVarWhitelist: ReadonlySet<string> | null,
): Endpoint | null {
	const fn = call.childForFieldName("function");
	if (!fn || fn.type !== "member_expression") {
		return null;
	}

	const receiver = fn.childForFieldName("object");
	if (!receiver || receiver.type !== "identifier") {
		return null;
	}
	const receiverName = receiver.text;
	if (appVarWhitelist && !appVarWhitelist.has(receiverName)) {
		return null;
	}

	const bindings = ctx.symbols.variables.get(receiverName);
	if (!bindings || bindings.length === 0) {
		return null;
	}
	const localBinding = bindings.find((b) => b.file === relPath);
	if (!localBinding || !allowedFactories.has(localBinding.factory)) {
		return null;
	}

	const prop = fn.childForFieldName("property");
	if (!prop) {
		return null;
	}
	const name = prop.text.toLowerCase();
	if (!HTTP_METHODS.has(name)) {
		return null;
	}

	const args = call.childForFieldName("arguments");
	if (!args) {
		return null;
	}
	const positional = args.namedChildren;
	const first = positional[0];
	if (!first) {
		return null;
	}
	const pathValue = jsStringLiteral(first);
	if (pathValue === null || !pathValue.startsWith("/")) {
		return null;
	}

	const handlerNode = positional[positional.length - 1];
	const handler = handlerNode
		? handlerNode.text.replace(/\s+/g, " ").slice(0, 80)
		: "<handler>";
	const method = name.toUpperCase();
	if (!isHttpMethod(method)) {
		return null;
	}
	const source: SourceLocation = {
		file: relPath,
		line: line1Based(call),
	};
	return { method, path: pathValue, handler, source };
}

function jsStringLiteral(node: SyntaxNode): string | null {
	if (node.type === "string" || node.type === "template_string") {
		return node.text.replace(/^[`'"](.*)[`'"]$/s, "$1");
	}
	return null;
}

function isHttpMethod(s: string): s is HttpMethod {
	return HTTP_METHODS.has(s.toLowerCase());
}
