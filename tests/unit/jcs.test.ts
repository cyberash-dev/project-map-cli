import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { jcs } from "../../src/features/detect/canonical/jcs.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VECTOR_DIR = path.resolve(HERE, "../fixtures/jcs");

function vector(name: string): string {
	return readFileSync(path.join(VECTOR_DIR, name), "utf8");
}

describe("RFC 8785 canonicalization", () => {
	/* @covers project-map:CTR-008 */
	it("serializes the published Appendix B vector to its expected bytes", () => {
		const parsed: unknown = JSON.parse(vector("appendix-b.input.json"));
		const expected = vector("appendix-b.expected.json").trimEnd();

		const serialized = jcs(parsed);

		expect(serialized).toBe(expected);
	});

	/* @covers project-map:CTR-008 */
	it("orders object keys by UTF-16 code unit rather than by code point", () => {
		const astralKey = String.fromCodePoint(0x1f600);
		const basicKey = "Ｚ";

		const serialized = jcs({ [basicKey]: 1, [astralKey]: 2 });

		expect(serialized).toBe(`{"${astralKey}":2,"${basicKey}":1}`);
	});

	/* @covers project-map:CTR-008 */
	it("preserves array order, which carries meaning the key order does not", () => {
		const serialized = jcs({ parts: ["b", "a", "c"] });

		expect(serialized).toBe('{"parts":["b","a","c"]}');
	});

	/* @covers project-map:CTR-008 */
	it("rejects a non-finite number rather than coercing it to null", () => {
		expect(() => jcs({ ratio: Number.POSITIVE_INFINITY })).toThrow(
			/non-finite/,
		);
	});

	/* @covers project-map:CTR-008 */
	it("rejects undefined, which carries no canonical form", () => {
		expect(() => jcs({ missing: undefined })).toThrow(/undefined/);
	});
});
