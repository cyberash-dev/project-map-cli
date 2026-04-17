import { z } from "zod";
import { ALL_LANGUAGES, FRAMEWORKS_BY_LANGUAGE } from "../../core/domain/language.js";
import { SECTION_IDS } from "../../core/domain/project-map.js";

const FRAMEWORK_VALUES = Array.from(
  new Set(Object.values(FRAMEWORKS_BY_LANGUAGE).flat()),
) as [string, ...string[]];

const LANGUAGE_VALUES = [...ALL_LANGUAGES] as [string, ...string[]];

const SECTION_VALUES = [...SECTION_IDS] as [string, ...string[]];

export const ConfigFileSchema = z
  .object({
    project: z.object({
      name: z.string().min(1),
      language: z.enum(LANGUAGE_VALUES),
      frameworks: z.array(z.enum(FRAMEWORK_VALUES)).default([]),
    }),
    root: z.string().default("."),
    exclude: z.array(z.string()).default([]),
    sections: z.array(z.enum(SECTION_VALUES)).default([...SECTION_IDS]),
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
            known_roles: z.record(z.string(), z.string()).default({}),
          })
          .default({ min_files: 10, known_roles: {} }),
      })
      .default({ custom: [], auto: { min_files: 10, known_roles: {} } }),
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
          .default({ method_count: 0.5, field_count: 0.3, inbound_references: 1.0 }),
      })
      .default({
        top_n: 30,
        include_fields: true,
        include_private_methods: false,
        importance: { method_count: 0.5, field_count: 0.3, inbound_references: 1.0 },
      }),
    enums: z
      .object({
        base_classes: z.array(z.string()).default(["enum.Enum", "Enum", "IntEnum", "StrEnum"]),
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
      .default({ patterns: ["class *Worker", "@celery.task", "@dramatiq.actor"] }),
    output: z
      .object({
        markdown: z.string().default("PROJECT_MAP.md"),
        json: z.string().nullable().default(null),
      })
      .default({ markdown: "PROJECT_MAP.md", json: null }),
  })
  .strict();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;
