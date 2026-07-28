import { z } from "zod";

const GLOB_SYNTAX = /[*?[\]]/;

/**
 * A selector points at a node, never at a set of them. Glob and character-class
 * syntax is rejected at configuration time rather than silently matching one
 * declaration today and two tomorrow.
 */
const selectorName = z.string().min(1).refine(hasNoGlobSyntax, {
	message:
		"a selector names one node: `*`, `?` and character classes are invalid selector syntax",
});

function hasNoGlobSyntax(value: string): boolean {
	return !GLOB_SYNTAX.test(value);
}

const ArgStep = z.object({
	kind: z.literal("arg"),
	selector: z.union([z.number().int().min(0), selectorName]),
});

const FieldStep = z.object({
	kind: z.literal("field"),
	selector: selectorName,
});

const ClassConstStep = z.object({
	kind: z.literal("class_const"),
	selector: selectorName,
});

const ReceiverStep = z.object({
	kind: z.literal("receiver"),
});

/**
 * A dotted path addresses named members. Expressing a positional index through
 * it would make the grammar ambiguous with `arg`; a chain says the same thing
 * without the ambiguity.
 */
const PropertyPathStep = z.object({
	kind: z.literal("property-path"),
	selector: selectorName.refine((value) => !/(^|\.)\d+(\.|$)/.test(value), {
		message:
			"a property-path selector addresses named members: use a chain to express a positional index",
	}),
});

const SelectorStepSchema = z.discriminatedUnion("kind", [
	ArgStep,
	FieldStep,
	ClassConstStep,
	ReceiverStep,
	PropertyPathStep,
]);

/** One step or an ordered chain; the single form is sugar for a chain of one. */
export const SelectorSchema = z
	.union([SelectorStepSchema, z.array(SelectorStepSchema).min(1)])
	.transform((value) => (Array.isArray(value) ? value : [value]));

export type SelectorStep = z.infer<typeof SelectorStepSchema>;
export type Selector = SelectorStep[];
