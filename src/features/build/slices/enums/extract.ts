import type { EnumType } from "../../../../core/domain/project-map.js";
import type { ILanguageAdapter } from "../../extractor.port.js";
import { LanguageDispatchExtractor } from "../../extractor.port.js";
import { GoEnumsAdapter } from "./adapters/go.js";
import { JavaEnumsAdapter } from "./adapters/java.js";
import { KotlinEnumsAdapter } from "./adapters/kotlin.js";
import { PythonEnumsAdapter } from "./adapters/python.js";
import { TypeScriptEnumsAdapter } from "./adapters/typescript.js";

export class EnumsExtractor extends LanguageDispatchExtractor<EnumType> {
  constructor() {
    const adapters: ILanguageAdapter<EnumType[]>[] = [
      new PythonEnumsAdapter(),
      new TypeScriptEnumsAdapter("typescript"),
      new TypeScriptEnumsAdapter("javascript"),
      new GoEnumsAdapter(),
      new JavaEnumsAdapter(),
      new KotlinEnumsAdapter(),
    ];
    super("enums", adapters, []);
  }
}
