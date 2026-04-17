import { ALL_LANGUAGES } from "../../core/domain/language.js";
import type { ISourceParser } from "../../core/ports/parser.port.js";

export class PrintVersionUseCase {
  constructor(
    private readonly toolVersion: string,
    private readonly parser: ISourceParser,
  ) {}

  render(): string {
    const supported = this.parser.languages().join(", ") || "(none — tree-sitter grammars missing)";
    const unsupported = ALL_LANGUAGES.filter((l) => !this.parser.supports(l));
    const lines = [
      `project-map v${this.toolVersion}`,
      `supported languages: ${supported}`,
    ];
    if (unsupported.length > 0) {
      lines.push(`missing grammars: ${unsupported.join(", ")}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
