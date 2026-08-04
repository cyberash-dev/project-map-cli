import { ConfigTimeError } from "../core/domain/config-time-error.js";
import type {
	CallShape,
	DiagnosticCode,
} from "../core/domain/facts/diagnostic.js";
import { DIAGNOSTIC_CODES } from "../core/domain/facts/diagnostic.js";
import type { BaselineEntry } from "../features/detect/merge/ratchet.js";

/**
 * Reads the baseline of project-map:CTR-010. It is not part of the analysis
 * unit and never reaches the artifact, so it is parsed here rather than by the
 * materializer, and a file that will not parse stops the run before it starts.
 */
export function parseBaseline(
	content: string,
	path: string,
): readonly BaselineEntry[] {
	const suppressed = at(read(content, path), "suppressed");
	if (!Array.isArray(suppressed)) {
		throw reject(path, "carries no suppressed array");
	}
	return suppressed.map((entry: unknown) => entryOf(entry, path));
}

function read(content: string, path: string): unknown {
	try {
		return JSON.parse(content);
	} catch (cause) {
		throw reject(path, `is not readable JSON: ${String(cause)}`);
	}
}

function entryOf(entry: unknown, path: string): BaselineEntry {
	return {
		code: codeOf(stringAt(entry, "code", path), path),
		canonical_callee: stringAt(entry, "canonical_callee", path),
		canonical_call_shape: shapeOf(at(entry, "canonical_call_shape"), path),
	};
}

function codeOf(code: string, path: string): DiagnosticCode {
	const known = DIAGNOSTIC_CODES.find((candidate) => candidate === code);
	if (known === undefined) {
		throw reject(path, `names an unknown diagnostic code ${code}`);
	}
	return known;
}

function shapeOf(shape: unknown, path: string): CallShape {
	const arity = at(shape, "arity");
	const receiver = at(shape, "receiver_type");
	if (typeof arity !== "number") {
		throw reject(path, "carries an entry whose arity is not a number");
	}
	return {
		arity,
		receiver_type: typeof receiver === "string" ? receiver : null,
	};
}

function stringAt(value: unknown, key: string, path: string): string {
	const found = at(value, key);
	if (typeof found !== "string") {
		throw reject(path, `carries an entry with no string ${key}`);
	}
	return found;
}

function at(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	const found: unknown = Reflect.get(value, key);
	return found;
}

function reject(path: string, why: string): ConfigTimeError {
	return new ConfigTimeError("schema_violation", `${path} ${why}`);
}
