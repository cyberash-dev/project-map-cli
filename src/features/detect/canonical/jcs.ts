/**
 * RFC 8785 JSON Canonicalization Scheme.
 *
 * Fixes object-key order, number form, string escaping and whitespace so that
 * two structurally equal documents serialize to identical bytes.
 */
export function jcs(value: unknown): string {
	return serialize(value);
}

function serialize(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (typeof value === "number") {
		return serializeNumber(value);
	}
	if (Array.isArray(value)) {
		return serializeArray(value);
	}
	if (isRecord(value)) {
		return serializeRecord(value);
	}
	if (value === undefined) {
		throw new TypeError("jcs: undefined has no canonical form");
	}
	throw new TypeError(`jcs: unsupported value of type ${typeof value}`);
}

function serializeNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new TypeError(`jcs: non-finite number ${String(value)}`);
	}
	return String(value);
}

function serializeArray(values: readonly unknown[]): string {
	return `[${values.map(serialize).join(",")}]`;
}

function serializeRecord(record: Record<string, unknown>): string {
	/*
	 * The default comparator orders by UTF-16 code unit, which is exactly the
	 * ordering RFC 8785 mandates. A code-point or locale-aware comparator
	 * would order astral keys differently and break byte stability.
	 */
	const members = Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`);
	return `{${members.join(",")}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
