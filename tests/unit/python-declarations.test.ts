import { describe, expect, it } from "vitest";
import { pythonDeclarationIndex } from "../../src/features/detect/index/python/declarations.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";

function indexOf(source: string) {
	const parser = new TreeSitterParserRegistry(
		["python"],
		new ConsoleLogger(false),
	);
	const parsed = parser.parse("python", source, "m.py", "/tmp/m.py");
	if (parsed === null) {
		throw new Error("parse failed");
	}
	return pythonDeclarationIndex(parsed);
}

describe("python declaration index", () => {
	/* @covers project-map:BEH-008 */
	it("records a class with its base names", () => {
		const index = indexOf("class Url(PrefixedUrl):\n    pass\n");

		expect(index.classOf("Url")?.bases).toEqual(["PrefixedUrl"]);
	});

	/* @covers project-map:BEH-008 */
	it("records a string class constant", () => {
		const index = indexOf(
			"class Url(PrefixedUrl):\n    PREFIX = '/api/merchant'\n",
		);

		expect(index.classOf("Url")?.constants.get("PREFIX")).toBe("/api/merchant");
	});

	/* @covers project-map:BEH-008 */
	it("records the async members a handler declares", () => {
		const index = indexOf(
			"class PingHandler(BaseHandler):\n    async def get(self):\n        pass\n\n    async def post(self):\n        pass\n",
		);

		expect([...(index.classOf("PingHandler")?.methods ?? [])].sort()).toEqual([
			"get",
			"post",
		]);
	});

	/* @covers project-map:BEH-008 */
	it("records a class that declares no member at all", () => {
		const index = indexOf("class Empty(Base):\n    pass\n");

		expect(index.classOf("Empty")?.methods.size).toBe(0);
	});

	/* @covers project-map:BEH-008 */
	it("returns null for a name no class declares", () => {
		const index = indexOf("class Url(Base):\n    pass\n");

		expect(index.classOf("Missing")).toBeNull();
	});

	/* @covers project-map:CTR-006 */
	it("anchors a class at its byte range in the source", () => {
		const source = "# тариф\nclass Url(Base):\n    pass\n";

		const declaration = indexOf(source).classOf("Url");

		const utf8 = Buffer.from(source, "utf8");
		expect(
			utf8
				.subarray(declaration?.anchor.start_byte, declaration?.anchor.end_byte)
				.toString("utf8")
				.startsWith("class Url"),
		).toBe(true);
	});
});
