import { describe, expect, it } from "vitest";
import {
	goImportIndex,
	goOriginMatches,
} from "../../src/features/detect/index/go/imports.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";

function indexOf(source: string) {
	const parser = new TreeSitterParserRegistry(["go"], new ConsoleLogger(false));
	const parsed = parser.parse("go", source, "m.go");
	if (parsed === null) {
		throw new Error("parse failed");
	}
	return goImportIndex(parsed);
}

describe("go import index", () => {
	/* @covers project-map:BEH-009 */
	it("binds an unaliased import under its last path segment", () => {
		const index = indexOf('package a\n\nimport "net/http"\n');

		expect(index.pathOf("http")).toBe("net/http");
	});

	/* @covers project-map:BEH-009 */
	it("skips a major-version segment when deriving the qualifier", () => {
		const index = indexOf('package a\n\nimport "github.com/go-chi/chi/v5"\n');

		expect(index.pathOf("chi")).toBe("github.com/go-chi/chi/v5");
		expect(index.pathOf("v5")).toBeNull();
	});

	/* @covers project-map:BEH-009 */
	it("binds an aliased import under the alias alone", () => {
		const index = indexOf(
			'package a\n\nimport (\n\trouting "github.com/go-chi/chi/v5"\n)\n',
		);

		expect(index.pathOf("routing")).toBe("github.com/go-chi/chi/v5");
		expect(index.pathOf("chi")).toBeNull();
	});

	/* @covers project-map:INV-004 */
	it("returns null for a qualifier the file never imported", () => {
		const index = indexOf('package a\n\nimport "net/http"\n');

		expect(index.pathOf("chi")).toBeNull();
	});
});

describe("go origin matching", () => {
	/* @covers project-map:INV-004 */
	it("matches a declared origin against a vendored copy of the same module", () => {
		expect(
			goOriginMatches("go-chi/chi/v5", "vendor/github.com/go-chi/chi/v5"),
		).toBe(true);
	});

	/* @covers project-map:INV-004 */
	it("refuses a module whose path merely ends with the declared characters", () => {
		expect(
			goOriginMatches("go-chi/chi/v5", "example.com/fake-go-chi/chi/v5"),
		).toBe(false);
	});
});
