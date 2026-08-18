import { describe, expect, it } from "vitest";
import type { ValueIr } from "../../src/core/domain/facts/value-ir.js";
import { goImportIndex } from "../../src/features/detect/index/go/imports.js";
import { goPackageIndex } from "../../src/features/detect/index/go/packages.js";
import {
	foldGoSinkValue,
	type GoFoldContext,
} from "../../src/features/detect/outbound/go-scope.js";
import { findAll, rootOf } from "../../src/infrastructure/parser/ts-utils.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";

type Anchored = {
	readonly node: ReturnType<typeof rootOf>;
	readonly context: GoFoldContext;
};

/**
 * Anchors on the identifier named inside `use`, so a constant declaration of
 * the same name is never the node under test.
 */
function anchor(source: string, name: string): Anchored {
	const parser = new TreeSitterParserRegistry(["go"], new ConsoleLogger(false));
	const parsed = parser.parse("go", source, "m.go");
	if (parsed === null) {
		throw new Error("parse failed");
	}
	const body = findAll(
		rootOf(parsed.tree),
		(child) => child.type === "function_declaration",
	)[0];
	if (body === undefined) {
		throw new Error("the source declares no function");
	}
	const node = findAll(
		body,
		(child) => child.type === "identifier" && child.text === name,
	)[0];
	if (node === undefined) {
		throw new Error(`the function names no ${name}`);
	}
	return {
		node,
		context: {
			module: { file: parsed, imports: goImportIndex(parsed), directory: "" },
			packages: goPackageIndex([parsed]),
		},
	};
}

function fold(source: string, name: string): ValueIr {
	const { node, context } = anchor(source, name);
	return foldGoSinkValue(node, context);
}

const THREE_EDGES = `package a

const third = "/near"
const second = third
const first = second

func use() {
	_ = first
}
`;

const FOUR_EDGES = `package a

const fourth = "/deep"
const third = fourth
const second = third
const first = second

func use() {
	_ = first
}
`;

const SELF_NAMING = `package a

const first = second
const second = first

func use() {
	_ = first
}
`;

describe("the go sink value fold", () => {
	/* @covers project-map:CTR-007 */
	it("resolves a value three constant edges from the call", () => {
		expect(fold(THREE_EDGES, "first")).toEqual({
			kind: "literal",
			value: "/near",
		});
	});

	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-035 */
	it("types a fourth constant edge as an exhausted budget", () => {
		expect(fold(FOUR_EDGES, "first")).toEqual({
			kind: "unknown",
			reason: "depth_exceeded",
		});
	});

	/* @covers project-map:CTR-007 */
	/* @covers project-map:DLT-035 */
	it("types a fold handed no node as dynamic", () => {
		const { context } = anchor(THREE_EDGES, "first");

		expect(foldGoSinkValue(null, context)).toEqual({
			kind: "unknown",
			reason: "dynamic",
		});
	});

	/* The reason a constant cycle carries is not pinned: the fold bounds it
	 * by the budget rather than by a visited set. See project-map:DLT-035. */
	/* @covers project-map:CTR-007 */
	it("terminates on a constant that names itself", () => {
		expect(fold(SELF_NAMING, "first")).toMatchObject({ kind: "unknown" });
	});
});
