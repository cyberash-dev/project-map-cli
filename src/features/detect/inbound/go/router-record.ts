import type { ValueIr } from "../../../../core/domain/facts/value-ir.js";
import type { SyntaxNode } from "../../../../infrastructure/parser/ts-utils.js";
import type { GoImportIndex } from "../../index/go/imports.js";
import type { GoPackageIndex } from "../../index/go/packages.js";
import { keyedFieldsOf } from "../../value/go-composite.js";
import type { RouterValue } from "./router-scope.js";

/**
 * A field of a record the analysis proved. A field the seeding literal never
 * assigned holds the zero value its declared type fixes, which is a proof the
 * source language gives rather than a guess.
 */
export type FieldValue =
	| { readonly kind: "router"; readonly value: RouterValue }
	| {
			readonly kind: "syntax";
			readonly node: SyntaxNode;
			readonly imports: GoImportIndex;
			readonly directory: string;
	  }
	| { readonly kind: "zero"; readonly goType: string };

export type RouterRecord = ReadonlyMap<string, FieldValue>;

export type RecordSeed = {
	readonly imports: GoImportIndex;
	readonly directory: string;
	readonly packages: GoPackageIndex;
	readonly routerOf: (node: SyntaxNode) => RouterValue | null;
};

/** Go fixes the zero value of every type; only a string carries a segment. */
export function zeroValueOf(goType: string): ValueIr {
	return goType === "string"
		? { kind: "literal", value: "" }
		: { kind: "unknown", reason: "dynamic" };
}

/**
 * Seeds a record from a composite literal. The declared field set is read
 * through the imports of the file that declares the struct, because the type
 * of a field is written in that package and not in the caller's.
 */
export function recordOf(
	literal: SyntaxNode,
	seed: RecordSeed,
): RouterRecord | null {
	if (literal.type !== "composite_literal") {
		return null;
	}
	const assigned = keyedFieldsOf(literal);
	const fields = new Map<string, FieldValue>();
	for (const [name, node] of assigned) {
		const router = seed.routerOf(node);
		fields.set(
			name,
			router === null
				? {
						kind: "syntax",
						node,
						imports: seed.imports,
						directory: seed.directory,
					}
				: { kind: "router", value: router },
		);
	}
	for (const [name, goType] of declaredFields(literal, seed)) {
		if (!fields.has(name)) {
			fields.set(name, { kind: "zero", goType });
		}
	}
	return fields.size === 0 ? null : fields;
}

function declaredFields(
	literal: SyntaxNode,
	seed: RecordSeed,
): ReadonlyMap<string, string> {
	const type = literal.childForFieldName("type");
	if (type === null) {
		return new Map();
	}
	const cut = type.text.indexOf(".");
	if (cut < 0) {
		return (
			seed.packages.at(seed.directory)?.declarations.typeOf(type.text)
				?.fields ?? new Map()
		);
	}
	const importPath = seed.imports.pathOf(type.text.slice(0, cut));
	if (importPath === null) {
		return new Map();
	}
	return (
		seed.packages
			.forImport(importPath)
			?.declarations.typeOf(type.text.slice(cut + 1))?.fields ?? new Map()
	);
}
