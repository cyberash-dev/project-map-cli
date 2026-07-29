import { z } from "zod";
import {
	ALL_LANGUAGES,
	FRAMEWORKS_BY_LANGUAGE,
} from "../../core/domain/language.js";
import {
	DEFAULT_SECTION_IDS,
	SECTION_IDS,
} from "../../core/domain/project-map.js";
import { SelectorSchema } from "./selector-schema.js";

const FRAMEWORK_VALUES = Array.from(
	new Set(Object.values(FRAMEWORKS_BY_LANGUAGE).flat()),
);

const LANGUAGE_VALUES = [...ALL_LANGUAGES];

const SECTION_VALUES = [...SECTION_IDS];

/**
 * `from: arg` without an index names no argument, so it would silently preserve
 * nothing. Refusing it at configuration time keeps the failure visible.
 */
const IdentityPreservingSchema = z
	.object({
		member: z.string().min(1),
		from: z.enum(["receiver", "arg"]),
		index: z.number().int().min(0).nullable().default(null),
		binds: z.literal("closure_arg0_param0").nullable().default(null),
	})
	.refine((entry) => entry.from !== "arg" || entry.index !== null, {
		message: "an identity_preserving entry with `from: arg` requires `index`",
	});

/** A bare string names a member and inherits every sink-level binding. */
const SinkCallSchema = z
	.union([
		z.string().min(1),
		z.object({
			member: z.string().min(1),
			path_arg: SelectorSchema.nullable().default(null),
			method: SelectorSchema.nullable().default(null),
			target: SelectorSchema.nullable().default(null),
		}),
	])
	.transform((entry) =>
		typeof entry === "string"
			? { member: entry, path_arg: null, method: null, target: null }
			: entry,
	);

const SinkSchema = z.object({
	base_type: z.string().min(1),
	call: z.array(SinkCallSchema).default([]),
	path_arg: SelectorSchema.nullable().default(null),
	method: SelectorSchema.nullable().default(null),
	target: SelectorSchema.nullable().default(null),
	path_via: z
		.object({
			member: z.string().min(1),
			arg: z.number().int().min(0),
		})
		.nullable()
		.default(null),
});

export const ConfigFileSchema = z
	.object({
		project: z.object({
			name: z.string().min(1),
			language: z.enum(LANGUAGE_VALUES),
			frameworks: z.array(z.enum(FRAMEWORK_VALUES)).default([]),
		}),
		root: z.string().default("."),
		respect_gitignore: z.boolean().default(false),
		exclude: z.array(z.string()).default([]),
		sections: z.array(z.enum(SECTION_VALUES)).default([...DEFAULT_SECTION_IDS]),
		overview: z
			.object({
				path: z.string().nullable().default(null),
			})
			.default({ path: null }),
		contexts: z
			.object({
				custom: z
					.array(z.object({ path: z.string(), role: z.string() }))
					.default([]),
				auto: z
					.object({
						min_files: z.number().int().positive().default(10),
						depth: z.number().int().min(1).max(10).default(2),
						known_roles: z.record(z.string(), z.string()).default({}),
					})
					.default({ min_files: 10, depth: 2, known_roles: {} }),
			})
			.default({
				custom: [],
				auto: { min_files: 10, depth: 2, known_roles: {} },
			}),
		entities: z
			.object({
				top_n: z.number().int().positive().default(30),
				include_fields: z.boolean().default(true),
				include_private_methods: z.boolean().default(false),
				importance: z
					.object({
						method_count: z.number().default(0.5),
						field_count: z.number().default(0.3),
						inbound_references: z.number().default(1.0),
					})
					.default({
						method_count: 0.5,
						field_count: 0.3,
						inbound_references: 1.0,
					}),
			})
			.default({
				top_n: 30,
				include_fields: true,
				include_private_methods: false,
				importance: {
					method_count: 0.5,
					field_count: 0.3,
					inbound_references: 1.0,
				},
			}),
		enums: z
			.object({
				base_classes: z
					.array(z.string())
					.default(["enum.Enum", "Enum", "IntEnum", "StrEnum"]),
			})
			.default({ base_classes: ["enum.Enum", "Enum", "IntEnum", "StrEnum"] }),
		endpoints: z
			.object({
				framework: z.enum(FRAMEWORK_VALUES).nullable().default(null),
				routes_module: z.string().nullable().default(null),
				app_var: z.string().nullable().default(null),
			})
			.default({ framework: null, routes_module: null, app_var: null }),
		storage: z
			.object({
				base_class: z.string().default("Base"),
				migrations_dir: z.string().nullable().default(null),
				last_n: z.number().int().positive().default(10),
			})
			.default({ base_class: "Base", migrations_dir: null, last_n: 10 }),
		interactions: z
			.object({
				dir: z.string().nullable().default(null),
			})
			.default({ dir: null }),
		workers: z
			.object({
				patterns: z
					.array(z.string())
					.default(["class *Worker", "@celery.task", "@dramatiq.actor"]),
			})
			.default({
				patterns: ["class *Worker", "@celery.task", "@dramatiq.actor"],
			}),
		output: z
			.object({
				markdown: z.string().default("PROJECT_MAP.md"),
				json: z.string().nullable().default(null),
				facts: z.string().nullable().default(null),
			})
			.default({ markdown: "PROJECT_MAP.md", json: null, facts: null }),
		repository_identity: z.string().min(1).nullable().default(null),
		openapi: z
			.object({
				serves: z
					.array(
						z.object({
							spec: z.string().min(1),
							contract_id: z.string().min(1),
							mount: z.string().nullable().default(null),
						}),
					)
					.default([]),
				consumes: z
					.array(
						z.object({
							generated_module: z.string().min(1),
							spec: z.string().min(1),
							contract_id: z.string().min(1),
						}),
					)
					.default([]),
			})
			.default({ serves: [], consumes: [] }),
		detect: z
			.object({
				inbound: z
					.object({
						routers: z
							.array(
								z.object({
									dsl: z.string().min(1),
									path_arg: SelectorSchema,
									prefix_from: SelectorSchema.nullable().default(null),
									verb_from: z
										.object({
											kind: z.literal("handler_methods"),
											handler: SelectorSchema,
										})
										.nullable()
										.default(null),
									identity_preserving: z
										.array(IdentityPreservingSchema)
										.default([]),
								}),
							)
							.default([]),
					})
					.default({ routers: [] }),
				outbound: z
					.object({
						sinks: z.array(SinkSchema).default([]),
						registry: z
							.array(
								z.object({
									container_type: z.string().min(1),
									access: z.string().min(1),
								}),
							)
							.default([]),
						module_ids: z
							.array(
								z.object({
									type: z.string().min(1),
									module_id: z.string().min(1),
								}),
							)
							.default([]),
					})
					.default({ sinks: [], registry: [], module_ids: [] }),
			})
			.default({
				inbound: { routers: [] },
				outbound: { sinks: [], registry: [], module_ids: [] },
			}),
		analysis_unit: z
			.object({
				sources: z
					.object({
						include: z.array(z.string()).default([]),
						exclude: z.array(z.string()).default([]),
					})
					.default({ include: [], exclude: [] }),
				config_declarations: z.array(z.string()).default([]),
			})
			.default({
				sources: { include: [], exclude: [] },
				config_declarations: [],
			}),
	})
	.strict()
	.superRefine(requireIdentityWhereFactsAreEmitted);

/**
 * The identity is meaningless for a configuration that emits no facts: only
 * the artifact and the linker read it. Requiring it unconditionally would
 * invalidate every configuration written before detection existed.
 */
function requireIdentityWhereFactsAreEmitted(
	document: {
		output: { facts: string | null };
		repository_identity: string | null;
		openapi: { serves: readonly unknown[]; consumes: readonly unknown[] };
	},
	ctx: z.RefinementCtx,
): void {
	if (document.repository_identity !== null) {
		return;
	}
	const declaresDetection =
		document.openapi.serves.length > 0 || document.openapi.consumes.length > 0;
	if (document.output.facts === null && !declaresDetection) {
		return;
	}
	ctx.addIssue({
		code: "custom",
		path: ["repository_identity"],
		message:
			"repository_identity is required when a facts artifact is emitted or a detection section is declared, because both carry it into the join",
	});
}

export type ConfigFile = z.infer<typeof ConfigFileSchema>;
