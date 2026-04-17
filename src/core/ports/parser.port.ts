import type { Language } from "../domain/language.js";

export type ParsedFile = {
  readonly relPath: string;
  readonly absPath: string;
  readonly language: Language;
  readonly content: string;
  readonly tree: unknown;
  readonly parseErrors: number;
};

export interface ISourceParser {
  supports(language: Language): boolean;
  parse(language: Language, content: string, relPath: string, absPath: string): ParsedFile | null;
  languages(): readonly Language[];
}
