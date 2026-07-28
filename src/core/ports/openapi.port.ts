import type { UnitDocument } from "./analysis-unit.port.js";

export type SpecOperation = {
	readonly path: string;
	readonly method: string;
	readonly operationId: string | null;
};

export type ParsedSpec =
	| {
			readonly kind: "readable";
			readonly basePath: string;
			readonly operations: readonly SpecOperation[];
	  }
	| { readonly kind: "unreadable"; readonly reason: string };

export interface IOpenApiReader {
	read(document: UnitDocument): ParsedSpec;
}
