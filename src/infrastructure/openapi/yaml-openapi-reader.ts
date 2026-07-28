import * as yaml from "yaml";
import type { UnitDocument } from "../../core/ports/analysis-unit.port.js";
import type {
	IOpenApiReader,
	ParsedSpec,
	SpecOperation,
} from "../../core/ports/openapi.port.js";

const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
] as const;

const SUPPORTED_MAJOR = /^3\.[01]/;
const LOCAL_REF = /^#\//;

export class YamlOpenApiReader implements IOpenApiReader {
	read(document: UnitDocument): ParsedSpec {
		const root = parseDocument(document.text);
		if (root === null) {
			return unreadable(document.locator, "the document does not parse");
		}
		const version = root["openapi"];
		if (typeof version !== "string" || !SUPPORTED_MAJOR.test(version)) {
			return unreadable(
				document.locator,
				"only OpenAPI 3.0 and 3.1 are read; Swagger 2.0 is deferred",
			);
		}
		const paths = asRecord(root["paths"]);
		if (paths === null) {
			return unreadable(document.locator, "the document declares no paths");
		}
		return {
			kind: "readable",
			/* servers name environments, so 3.x contributes no base path. */
			basePath: "",
			operations: withUniqueOperationIds(operationsOf(paths, root)),
		};
	}
}

function unreadable(locator: string, reason: string): ParsedSpec {
	return { kind: "unreadable", reason: `${locator}: ${reason}` };
}

function parseDocument(text: string): Record<string, unknown> | null {
	try {
		return asRecord(yaml.parse(text));
	} catch {
		return null;
	}
}

function operationsOf(
	paths: Record<string, unknown>,
	root: Record<string, unknown>,
): SpecOperation[] {
	const operations: SpecOperation[] = [];
	for (const [specPath, rawItem] of Object.entries(paths)) {
		const item = resolveRef(asRecord(rawItem), root);
		if (item === null) {
			continue;
		}
		for (const method of HTTP_METHODS) {
			const operation = resolveRef(asRecord(item[method]), root);
			if (operation === null) {
				continue;
			}
			operations.push({
				path: specPath,
				method: method.toUpperCase(),
				operationId: readOperationId(operation),
			});
		}
	}
	return operations;
}

function readOperationId(operation: Record<string, unknown>): string | null {
	const id = operation["operationId"];
	return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * An operation id is a join key only while it names one operation. A document
 * that repeats one drops it for every operation carrying it, so the fallback
 * of method plus canonical path takes over rather than a colliding id.
 */
function withUniqueOperationIds(
	operations: readonly SpecOperation[],
): SpecOperation[] {
	const seen = new Map<string, number>();
	for (const operation of operations) {
		if (operation.operationId !== null) {
			seen.set(
				operation.operationId,
				(seen.get(operation.operationId) ?? 0) + 1,
			);
		}
	}
	return operations.map((operation) =>
		operation.operationId !== null && seen.get(operation.operationId) === 1
			? operation
			: { ...operation, operationId: null },
	);
}

function resolveRef(
	node: Record<string, unknown> | null,
	root: Record<string, unknown>,
): Record<string, unknown> | null {
	if (node === null) {
		return null;
	}
	const ref = node["$ref"];
	if (typeof ref !== "string" || !LOCAL_REF.test(ref)) {
		return node;
	}
	return asRecord(pointerTarget(ref.slice(2).split("/"), root));
}

function pointerTarget(
	segments: readonly string[],
	root: Record<string, unknown>,
): unknown {
	let cursor: unknown = root;
	for (const segment of segments) {
		const record = asRecord(cursor);
		if (record === null) {
			return null;
		}
		cursor = record[decodePointerSegment(segment)];
	}
	return cursor;
}

function decodePointerSegment(segment: string): string {
	return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const entries = Object.entries(value);
	return Object.fromEntries(entries);
}
