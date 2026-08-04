import type { RootContent } from "mdast";
import type {
	DetectionFact,
	EndpointFact,
	OutboundOperationFact,
} from "../../../core/domain/facts/fact.js";
import { isEndpointFact } from "../../../core/domain/facts/fact.js";
import type { ValueIr } from "../../../core/domain/facts/value-ir.js";
import type { DetectionSectionId } from "../../../core/domain/project-map.js";
import type { FactSet } from "../../detect/detect.use-case.js";
import { codeCell, heading, paragraph, table, text } from "./mdast-helpers.js";

/**
 * The reworked detection rendered under its own section ids. A hole keeps its
 * reason in the document: a reader has to be able to tell a route nobody
 * declared from one the analyzer could not prove.
 */
export function renderDetectionSection(
	id: DetectionSectionId,
	facts: FactSet | null,
): RootContent[] {
	if (facts === null) {
		return [];
	}
	if (id === "endpoints") {
		return renderInbound(facts.facts.filter(isEndpointFact));
	}
	if (id === "interactions") {
		return renderOutbound(facts.facts.filter(isOutbound));
	}
	return renderCoverage(facts);
}

function isOutbound(fact: DetectionFact): fact is OutboundOperationFact {
	return fact.kind === "outbound_operation";
}

function renderInbound(facts: readonly EndpointFact[]): RootContent[] {
	if (facts.length === 0) {
		return [];
	}
	return [
		heading(2, "HTTP endpoints"),
		table(
			["Method", "Route", "Resolution", "Provenance", "Contracts"],
			facts.map((fact) => [
				codeCell(render(methodOf(fact))),
				codeCell(render(pathOf(fact))),
				codeCell(fact.resolution),
				codeCell([...fact.provenance].join(", ")),
				codeCell(fact.contract_refs.map((ref) => ref.contract_id).join(", ")),
			]),
		),
	];
}

function renderOutbound(
	facts: readonly OutboundOperationFact[],
): RootContent[] {
	if (facts.length === 0) {
		return [];
	}
	return [
		heading(2, "External dependencies"),
		table(
			["Owner", "Method", "Route", "Destination", "Resolution"],
			facts.map((fact) => [
				codeCell(fact.owner_operation),
				codeCell(render(methodOf(fact))),
				codeCell(render(pathOf(fact))),
				codeCell(destinationOf(fact)),
				codeCell(fact.resolution),
			]),
		),
	];
}

function renderCoverage(facts: FactSet): RootContent[] {
	const rows = Object.entries(facts.coverage).map(([key, value]) => [
		codeCell(key),
		typeof value === "string" ? codeCell(value) : String(value),
	]);
	const diagnostics = facts.diagnostics.map((entry) => [
		codeCell(entry.code),
		codeCell(entry.canonical_callee),
		String(entry.count),
	]);
	return [
		heading(2, "Detection coverage"),
		table(["Measure", "Value"], rows),
		...(diagnostics.length === 0
			? []
			: [
					paragraph([
						text("Unclassified sites inside the candidate universe:"),
					]),
					table(["Code", "Callee", "Anchors"], diagnostics),
				]),
	];
}

function methodOf(fact: DetectionFact): ValueIr | null {
	const variant = fact.operation.variants[0];
	return variant !== undefined && "http" in variant
		? variant.http.method
		: null;
}

function pathOf(fact: DetectionFact): ValueIr | null {
	const variant = fact.operation.variants[0];
	return variant !== undefined && "http" in variant ? variant.http.path : null;
}

function destinationOf(fact: OutboundOperationFact): string {
	const variant = fact.operation.variants[0];
	if (variant === undefined || !("http" in variant)) {
		return "";
	}
	const destination = variant.http.destination;
	if (destination === undefined) {
		return "";
	}
	if (destination.kind === "unknown") {
		return `unknown(${destination.reason})`;
	}
	return render(destination.ref);
}

function render(value: ValueIr | null): string {
	if (value === null) {
		return "";
	}
	if (value.kind === "literal") {
		return value.value;
	}
	if (value.kind === "unknown") {
		return `unknown(${value.reason})`;
	}
	if (value.kind === "config_ref") {
		return `config(${value.ref.declaration}:${value.ref.path_segments.join(".")})`;
	}
	if (value.kind === "template") {
		return value.parts
			.map((part) => (typeof part === "string" ? part : render(part)))
			.join("");
	}
	return `(${value.kind})`;
}
