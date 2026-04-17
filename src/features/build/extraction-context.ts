import type { Language } from "../../core/domain/language.js";
import type { ResolvedConfig } from "../../core/ports/config.port.js";
import type { IFileReader } from "../../core/ports/filesystem.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";
import type { ISourceParser, ParsedFile } from "../../core/ports/parser.port.js";

export type SymbolIndex = {
  readonly defs: ReadonlyMap<string, ReadonlyArray<{ file: string; line: number }>>;
  readonly inbound: ReadonlyMap<string, number>;
  readonly importsByFile: ReadonlyMap<string, readonly string[]>;
};

export type ExtractionContext = {
  readonly config: ResolvedConfig;
  readonly projectRoot: string;
  readonly language: Language;
  readonly files: readonly ParsedFile[];
  readonly filesByPath: ReadonlyMap<string, ParsedFile>;
  readonly parser: ISourceParser;
  readonly reader: IFileReader;
  readonly symbols: SymbolIndex;
  readonly logger: ILogger;
};
