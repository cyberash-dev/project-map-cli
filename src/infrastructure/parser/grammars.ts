import { createRequire } from "node:module";
import type { Language } from "../../core/domain/language.js";

const require = createRequire(import.meta.url);

type TypeScriptGrammarModule = {
	readonly typescript: unknown;
};

function isTypeScriptGrammarModule(
	value: unknown,
): value is TypeScriptGrammarModule {
	return typeof value === "object" && value !== null && "typescript" in value;
}

export function loadGrammar(language: Language): unknown {
	try {
		switch (language) {
			case "python":
				return require("tree-sitter-python");
			case "javascript":
				return require("tree-sitter-javascript");
			case "typescript": {
				const mod: unknown = require("tree-sitter-typescript");
				return isTypeScriptGrammarModule(mod) ? (mod.typescript ?? null) : null;
			}
			case "go":
				return require("tree-sitter-go");
			case "java":
				return require("tree-sitter-java");
			case "kotlin":
				return require("@tree-sitter-grammars/tree-sitter-kotlin");
		}
	} catch {
		return null;
	}
}
