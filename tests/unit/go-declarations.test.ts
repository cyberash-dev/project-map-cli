import { describe, expect, it } from "vitest";
import type { ParsedFile } from "../../src/core/ports/parser.port.js";
import { goDeclarationIndex } from "../../src/features/detect/index/go/declarations.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";

function parse(relPath: string, source: string): ParsedFile {
	const parser = new TreeSitterParserRegistry(["go"], new ConsoleLogger(false));
	const parsed = parser.parse("go", source, relPath);
	if (parsed === null) {
		throw new Error("parse failed");
	}
	return parsed;
}

const ROOT = `package api

type builder struct{}

func NewRouter() int {
	return 0
}

func (b *builder) build() int {
	return 0
}
`;

const OTHER = `package api

func Serve() int {
	return 0
}
`;

describe("the go declaration index", () => {
	/* A syntax node is a fresh wrapper on every access, so an index keyed on
	 * node identity silently answers nothing. See project-map:BEH-019. */
	/* @covers project-map:BEH-019 */
	it("names the file a function was declared in", () => {
		const index = goDeclarationIndex([
			parse("api/router.go", ROOT),
			parse("api/server.go", OTHER),
		]);

		expect(index.fileOf("func:NewRouter")).toBe("api/router.go");
		expect(index.fileOf("func:Serve")).toBe("api/server.go");
	});

	/* @covers project-map:BEH-019 */
	it("names the file a method was declared in", () => {
		const index = goDeclarationIndex([
			parse("api/router.go", ROOT),
			parse("api/server.go", OTHER),
		]);

		expect(index.fileOf("method:builder.build")).toBe("api/router.go");
	});

	/* @covers project-map:BEH-019 */
	it("names no file for a declaration the package does not hold", () => {
		const index = goDeclarationIndex([parse("api/router.go", ROOT)]);

		expect(index.fileOf("func:Missing")).toBeNull();
	});
});
