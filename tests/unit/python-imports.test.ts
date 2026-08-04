import { describe, expect, it } from "vitest";
import { pythonImportIndex } from "../../src/features/detect/index/python/imports.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";

function indexOf(source: string) {
	const parser = new TreeSitterParserRegistry(
		["python"],
		new ConsoleLogger(false),
	);
	const parsed = parser.parse("python", source, "m.py");
	if (parsed === null) {
		throw new Error("parse failed");
	}
	return pythonImportIndex(parsed);
}

describe("python import index", () => {
	/* @covers project-map:BEH-008 */
	it("resolves a plain from-import to its module and original name", () => {
		const index = indexOf("from a.b.sendr_aiohttp import PrefixedUrl\n");

		expect(index.originOf("PrefixedUrl")).toBe("a.b.sendr_aiohttp.PrefixedUrl");
	});

	/* @covers project-map:BEH-008 */
	it("resolves an aliased import to the original name, not the alias", () => {
		const index = indexOf("from a.b.sendr_aiohttp import Url as PureUrl\n");

		expect(index.originOf("PureUrl")).toBe("a.b.sendr_aiohttp.Url");
		expect(index.originOf("Url")).toBeNull();
	});

	/* @covers project-map:BEH-008 */
	it("resolves a parenthesised multi-name import", () => {
		const index = indexOf(
			"from pkg.handlers import (\n    LoadHandler,\n    PingHandler,\n)\n",
		);

		expect(index.originOf("PingHandler")).toBe("pkg.handlers.PingHandler");
		expect(index.originOf("LoadHandler")).toBe("pkg.handlers.LoadHandler");
	});

	/* @covers project-map:BEH-008 */
	it("records a module import under its bound name", () => {
		const index = indexOf("import pkg.sub\nimport pkg.other as other\n");

		expect(index.moduleOf("pkg.sub")).toBe("pkg.sub");
		expect(index.moduleOf("other")).toBe("pkg.other");
	});

	/* @covers project-map:BEH-008 */
	it("returns null for a name the module never imported", () => {
		const index = indexOf("from pkg import Thing\n");

		expect(index.originOf("Other")).toBeNull();
	});

	/* @covers project-map:INV-004 */
	it("binds a name that shadows an import to the local definition", () => {
		const index = indexOf("from pkg import Url\n\n\nclass Url:\n    pass\n");

		expect(index.isShadowedLocally("Url")).toBe(true);
	});
});
