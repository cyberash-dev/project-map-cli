import { readFile } from "node:fs/promises";
import * as path from "node:path";

export type Route = {
	readonly method: string;
	readonly path: string;
	readonly resolution: string;
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

/**
 * Renders a value IR the way an assertion reads it: a resolved value as itself
 * and an unresolved one as its typed hole, so a test names the reason instead
 * of asserting on the absence of a field.
 */
function renderValue(value: unknown): string {
	const kind = stringAt(value, "kind");
	if (kind === "literal") {
		return stringAt(value, "value");
	}
	if (kind === "unknown") {
		return `{unknown:${stringAt(value, "reason")}}`;
	}
	if (kind !== "template") {
		return `{${kind}}`;
	}
	const parts = memberAt(value, "parts");
	if (!Array.isArray(parts)) {
		throw new Error("expected a template parts array");
	}
	return parts
		.map((part) => (typeof part === "string" ? part : renderValue(part)))
		.join("");
}

function routeOf(fact: unknown): Route {
	const variants = memberAt(memberAt(fact, "operation"), "variants");
	if (!Array.isArray(variants)) {
		throw new Error("expected a variants array");
	}
	const http = memberAt(variants[0], "http");
	return {
		method: renderValue(memberAt(http, "method")),
		path: renderValue(memberAt(http, "path")),
		resolution: stringAt(fact, "resolution"),
	};
}

export async function routesOf(dir: string): Promise<Route[]> {
	const artifact: unknown = JSON.parse(
		await readFile(path.join(dir, ".project-map/facts.json"), "utf8"),
	);
	const facts = memberAt(artifact, "facts");
	if (!Array.isArray(facts)) {
		throw new Error("artifact carries no facts array");
	}
	return facts.map(routeOf);
}
