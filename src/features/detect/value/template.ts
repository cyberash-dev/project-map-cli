import type {
	TemplatePart,
	ValueIr,
} from "../../../core/domain/facts/value-ir.js";

function isSameHole(part: TemplatePart, previous: TemplatePart): boolean {
	if (typeof part === "string" || typeof previous === "string") {
		return false;
	}
	if (part.kind !== "unknown" || previous.kind !== "unknown") {
		return false;
	}
	return part.reason === previous.reason;
}

export function partsOf(value: ValueIr): readonly TemplatePart[] {
	if (value.kind === "literal") {
		return [value.value];
	}
	if (value.kind === "template") {
		return value.parts;
	}
	return [value];
}

export function concatValues(left: ValueIr, right: ValueIr): ValueIr {
	return templateOf([...partsOf(left), ...partsOf(right)]);
}

/**
 * Adjacent runs are joined so that one route has one spelling: a template
 * whose parts differ only in where the concatenation happened would otherwise
 * serialize to different bytes and split the fact. Two adjacent holes of the
 * same reason are one hole, because nothing distinguishes them.
 */
export function templateOf(parts: readonly TemplatePart[]): ValueIr {
	const merged: TemplatePart[] = [];
	for (const part of parts) {
		const previous = merged[merged.length - 1];
		if (typeof part === "string" && typeof previous === "string") {
			merged[merged.length - 1] = previous + part;
			continue;
		}
		if (previous !== undefined && isSameHole(part, previous)) {
			continue;
		}
		merged.push(part);
	}
	const only = merged[0];
	if (merged.length <= 1 && (only === undefined || typeof only === "string")) {
		return { kind: "literal", value: only ?? "" };
	}
	return { kind: "template", parts: merged };
}
