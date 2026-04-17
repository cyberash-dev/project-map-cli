import { createRequire } from "node:module";
import type { Language } from "../../core/domain/language.js";

const require = createRequire(import.meta.url);

export function loadGrammar(language: Language): unknown | null {
  try {
    switch (language) {
      case "python":
        return require("tree-sitter-python");
      case "javascript":
        return require("tree-sitter-javascript");
      case "typescript": {
        const mod = require("tree-sitter-typescript") as { typescript: unknown };
        return mod.typescript ?? null;
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
