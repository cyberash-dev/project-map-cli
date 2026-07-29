import { readFile } from "node:fs/promises";
import * as path from "node:path";

export type Operation = {
	readonly provenance: string;
	readonly owner: string;
	readonly method: string;
	readonly path: string;
	readonly destinations: readonly string[];
	readonly bindings: readonly string[];
	readonly resolution: string;
};

export type DiagnosticView = {
	readonly code: string;
	readonly callee: string;
	readonly count: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function memberAt(value: unknown, key: string): unknown {
	if (!isRecord(value)) {
		throw new Error(`expected a record carrying ${key}`);
	}
	return value[key];
}

function stringAt(value: unknown, key: string): string {
	const found = memberAt(value, key);
	if (typeof found !== "string") {
		throw new Error(`expected a string at ${key}`);
	}
	return found;
}

function arrayAt(value: unknown, key: string): readonly unknown[] {
	const found = memberAt(value, key);
	if (!Array.isArray(found)) {
		throw new Error(`expected an array at ${key}`);
	}
	return found;
}

/** Renders a value IR the way an assertion reads it, holes included. */
export function renderValue(value: unknown): string {
	const kind = stringAt(value, "kind");
	if (kind === "literal") {
		return stringAt(value, "value");
	}
	if (kind === "unknown") {
		return `{unknown:${stringAt(value, "reason")}}`;
	}
	if (kind === "config_ref") {
		const ref = memberAt(value, "ref");
		const segments = arrayAt(ref, "path_segments").join(".");
		return `config(${stringAt(ref, "declaration")}:${segments})`;
	}
	if (kind !== "template") {
		return `{${kind}}`;
	}
	return arrayAt(value, "parts")
		.map((part) => (typeof part === "string" ? part : renderValue(part)))
		.join("");
}

function operationOf(fact: unknown): Operation {
	const variants = arrayAt(memberAt(fact, "operation"), "variants");
	const http = variants.map((variant) => memberAt(variant, "http"));
	const first = http[0];
	return {
		provenance: arrayAt(fact, "provenance").join("+"),
		owner: stringAt(fact, "owner_operation"),
		method: renderValue(memberAt(first, "method")),
		path: renderValue(memberAt(first, "path")),
		destinations: http.map((variant) =>
			renderDestination(memberAt(variant, "destination")),
		),
		bindings: http.map((variant) =>
			bindingOf(memberAt(variant, "destination")),
		),
		resolution: stringAt(fact, "resolution"),
	};
}

function renderDestination(destination: unknown): string {
	if (stringAt(destination, "kind") === "unknown") {
		return `{unknown:${stringAt(destination, "reason")}}`;
	}
	return renderValue(memberAt(destination, "ref"));
}

function bindingOf(destination: unknown): string {
	if (stringAt(destination, "kind") === "unknown") {
		return `unknown:${stringAt(destination, "reason")}`;
	}
	return stringAt(destination, "binding");
}

async function artifactOf(dir: string): Promise<unknown> {
	return JSON.parse(
		await readFile(path.join(dir, ".project-map/facts.json"), "utf8"),
	);
}

export async function operationsOf(dir: string): Promise<Operation[]> {
	const facts = arrayAt(await artifactOf(dir), "facts");
	return facts
		.filter((fact) => stringAt(fact, "kind") === "outbound_operation")
		.map(operationOf);
}

export async function diagnosticsOf(dir: string): Promise<DiagnosticView[]> {
	const found = arrayAt(await artifactOf(dir), "diagnostics");
	return found.map((entry) => ({
		code: stringAt(entry, "code"),
		callee: stringAt(entry, "canonical_callee"),
		count: Number(memberAt(entry, "count")),
	}));
}
