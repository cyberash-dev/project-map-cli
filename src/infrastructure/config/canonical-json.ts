function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isList(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}

function compareKeys(left: string, right: string): number {
	if (left === right) {
		return 0;
	}
	return left < right ? -1 : 1;
}

/**
 * Serializes a value with object keys sorted at every depth and array order
 * preserved, so the result is a stable digest input for an equal document
 * written with differently ordered keys.
 */
export function canonicalJson(value: unknown): string {
	if (value === undefined) {
		return "null";
	}
	if (isList(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (isRecord(value)) {
		const body = Object.entries(value)
			.filter(([, nested]) => nested !== undefined)
			.sort(([left], [right]) => compareKeys(left, right))
			.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
			.join(",");
		return `{${body}}`;
	}
	return JSON.stringify(value);
}
