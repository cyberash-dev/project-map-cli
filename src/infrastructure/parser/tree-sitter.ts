import Parser from "tree-sitter";
import type { Language } from "../../core/domain/language.js";
import type { ILogger } from "../../core/ports/logger.port.js";
import type { ISourceParser, ParsedFile } from "../../core/ports/parser.port.js";
import { loadGrammar } from "./grammars.js";

type GrammarHandle = {
  language: Language;
  grammar: unknown;
  parser: Parser;
};

export class TreeSitterParserRegistry implements ISourceParser {
  private readonly grammars = new Map<Language, GrammarHandle>();

  constructor(
    enabledLanguages: readonly Language[],
    private readonly logger: ILogger,
  ) {
    for (const lang of enabledLanguages) {
      const grammar = loadGrammar(lang);
      if (grammar === null) {
        this.logger.warn(`tree-sitter grammar for ${lang} not available; skipping`);
        continue;
      }
      const parser = new Parser();
      try {
        (parser as unknown as { setLanguage: (g: unknown) => void }).setLanguage(grammar);
      } catch (err) {
        this.logger.warn(`failed to set grammar for ${lang}: ${(err as Error).message}`);
        continue;
      }
      this.grammars.set(lang, { language: lang, grammar, parser });
    }
  }

  supports(language: Language): boolean {
    return this.grammars.has(language);
  }

  languages(): readonly Language[] {
    return [...this.grammars.keys()];
  }

  parse(language: Language, content: string, relPath: string, absPath: string): ParsedFile | null {
    const handle = this.grammars.get(language);
    if (!handle) return null;
    try {
      const tree = handle.parser.parse(content);
      const parseErrors = countErrors(tree.rootNode as unknown as TSNode);
      return {
        relPath,
        absPath,
        language,
        content,
        tree,
        parseErrors,
      };
    } catch (err) {
      this.logger.warn(`parse failed for ${relPath}: ${(err as Error).message}`);
      return null;
    }
  }

  grammarFor(language: Language): unknown | null {
    return this.grammars.get(language)?.grammar ?? null;
  }
}

type TSNode = {
  type: string;
  hasError?: boolean;
  children?: TSNode[];
  namedChildren?: TSNode[];
};

function countErrors(node: TSNode): number {
  let count = 0;
  if (node.type === "ERROR" || node.hasError === true) count += 1;
  const children = node.children ?? [];
  for (const c of children) count += countErrors(c);
  return count;
}
