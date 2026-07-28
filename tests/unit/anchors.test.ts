import { describe, expect, it } from "vitest";
import { byteOffsetTable } from "../../src/features/detect/index/anchors.js";

describe("UTF-16 to UTF-8 anchor mapping", () => {
	/* @covers project-map:CTR-006 */
	it("maps an ASCII source one code unit to one byte", () => {
		const source = "func main() {}";

		const table = byteOffsetTable(source);

		expect(table.byteOffsetAt(5)).toBe(5);
		expect(table.byteOffsetAt(source.length)).toBe(14);
	});

	/* @covers project-map:CTR-006 */
	it("counts a two-byte character as two bytes", () => {
		const source = "тариф";

		const table = byteOffsetTable(source);

		expect(table.byteOffsetAt(5)).toBe(10);
	});

	/* @covers project-map:CTR-006 */
	it("counts a surrogate pair as four bytes", () => {
		const source = String.fromCodePoint(0x1f600) + "x";

		const table = byteOffsetTable(source);

		expect(table.byteOffsetAt(2)).toBe(4);
		expect(table.byteOffsetAt(3)).toBe(5);
	});

	/* @covers project-map:CTR-006 */
	/* @covers project-map:INV-003 */
	it("slices identical text through the code-unit and the byte view", () => {
		const source = "/* тариф на 100₽ */\nvar счёт = 1;\n";
		const utf16Start = source.indexOf("var");
		const utf16End = utf16Start + "var счёт = 1;".length;
		const utf8 = Buffer.from(source, "utf8");

		const table = byteOffsetTable(source);

		expect(
			utf8
				.subarray(table.byteOffsetAt(utf16Start), table.byteOffsetAt(utf16End))
				.toString("utf8"),
		).toBe(source.slice(utf16Start, utf16End));
	});

	/* @covers project-map:CTR-006 */
	it("rejects an index past the end of the source", () => {
		const table = byteOffsetTable("abc");

		expect(() => table.byteOffsetAt(4)).toThrow(/out of range/);
	});
});
