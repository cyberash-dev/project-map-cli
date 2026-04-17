import type { Endpoint } from "../../../../core/domain/project-map.js";
import type { ILanguageAdapter } from "../../extractor.port.js";
import { LanguageDispatchExtractor } from "../../extractor.port.js";
import { GoEndpointsAdapter } from "./adapters/go.js";
import { JavaEndpointsAdapter } from "./adapters/java.js";
import { KotlinEndpointsAdapter } from "./adapters/kotlin.js";
import { PythonEndpointsAdapter } from "./adapters/python.js";
import { TypeScriptEndpointsAdapter } from "./adapters/typescript.js";

export class EndpointsExtractor extends LanguageDispatchExtractor<Endpoint> {
  constructor() {
    const adapters: ILanguageAdapter<Endpoint[]>[] = [
      new PythonEndpointsAdapter(),
      new TypeScriptEndpointsAdapter("typescript"),
      new TypeScriptEndpointsAdapter("javascript"),
      new GoEndpointsAdapter(),
      new JavaEndpointsAdapter(),
      new KotlinEndpointsAdapter(),
    ];
    super("endpoints", adapters, []);
  }
}
