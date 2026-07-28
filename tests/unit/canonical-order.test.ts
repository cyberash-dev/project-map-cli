import { describe, expect, it } from "vitest";
import type { Evidence } from "../../src/core/domain/facts/anchor.js";
import type { ContractRef } from "../../src/core/domain/facts/fact.js";
import {
	orderByCanonicalBytes,
	orderContractRefs,
	orderEvidence,
} from "../../src/features/detect/canonical/array-order.js";

function evidenceAt(
	path: string,
	start: number,
	role: Evidence["role"] = "call",
): Evidence {
	return { path, start_byte: start, end_byte: start + 4, role };
}

describe("canonical array ordering", () => {
	/* @covers project-map:CTR-008 */
	it("orders evidence by path, then start byte, then end byte, then role", () => {
		const shuffled: readonly Evidence[] = [
			evidenceAt("b.go", 10),
			evidenceAt("a.go", 20),
			evidenceAt("a.go", 5, "registration"),
			evidenceAt("a.go", 5, "call"),
		];

		const ordered = orderEvidence(shuffled);

		expect(ordered.map((e) => `${e.path}:${e.start_byte}:${e.role}`)).toEqual([
			"a.go:5:call",
			"a.go:5:registration",
			"a.go:20:call",
			"b.go:10:call",
		]);
	});

	/* @covers project-map:CTR-008 */
	it("orders contract refs by contract id, then operation id", () => {
		const shuffled: readonly ContractRef[] = [
			{ contract_id: "pay.v1", operation_id: "b" },
			{ contract_id: "midas.v2", operation_id: "z" },
			{ contract_id: "pay.v1", operation_id: "a" },
		];

		const ordered = orderContractRefs(shuffled);

		expect(ordered.map((r) => `${r.contract_id}/${r.operation_id}`)).toEqual([
			"midas.v2/z",
			"pay.v1/a",
			"pay.v1/b",
		]);
	});

	/* @covers project-map:CTR-008 */
	it("orders an unkeyed set by its canonical bytes", () => {
		const shuffled = [{ b: 2 }, { a: 1 }, { a: 0 }];

		const ordered = orderByCanonicalBytes(shuffled);

		expect(ordered).toEqual([{ a: 0 }, { a: 1 }, { b: 2 }]);
	});

	/* @covers project-map:CTR-008 */
	it("leaves the caller's array untouched", () => {
		const original: readonly ContractRef[] = [
			{ contract_id: "z", operation_id: "z" },
			{ contract_id: "a", operation_id: "a" },
		];

		orderContractRefs(original);

		expect(original[0]?.contract_id).toBe("z");
	});
});
