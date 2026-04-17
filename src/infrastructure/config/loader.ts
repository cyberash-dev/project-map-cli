import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { cosmiconfig } from "cosmiconfig";
import * as yaml from "yaml";
import type { Framework, Language } from "../../core/domain/language.js";
import type {
  ContextsConfig,
  EndpointsConfig,
  EntitiesConfig,
  EnumsConfig,
  IConfigLoader,
  InteractionsConfig,
  OutputConfig,
  OverviewConfig,
  ResolvedConfig,
  StorageConfig,
  WorkersConfig,
} from "../../core/ports/config.port.js";
import { type ConfigFile, ConfigFileSchema } from "./schema.js";
import { DEFAULT_KNOWN_ROLES, defaultConfigYaml, defaultExcludes } from "./defaults.js";

const MODULE_NAME = "project-map";

export class CosmiconfigLoader implements IConfigLoader {
  async load(cwd: string, explicitPath: string | null): Promise<ResolvedConfig | null> {
    const explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: [
        ".project-map.yaml",
        ".project-map.yml",
        ".project-map.json",
        "project-map.config.ts",
        "project-map.config.js",
        "package.json",
      ],
      loaders: {
        ".yaml": (_, content) => yaml.parse(content),
        ".yml": (_, content) => yaml.parse(content),
      },
    });

    const result = explicitPath
      ? await explorer.load(explicitPath)
      : await explorer.search(cwd);
    if (!result || result.isEmpty) return null;

    const parsed = ConfigFileSchema.parse(result.config);
    const sourcePath = result.filepath;
    return resolveConfig(parsed, sourcePath, cwd);
  }

  async writeDefault(
    targetPath: string,
    language: Language,
    framework: Framework | null,
  ): Promise<void> {
    const name = path.basename(path.dirname(path.resolve(targetPath)));
    const content = defaultConfigYaml(name || "my-project", language, framework);
    await writeFile(targetPath, content, "utf8");
  }
}

function resolveConfig(raw: ConfigFile, sourcePath: string, cwd: string): ResolvedConfig {
  const configDir = path.dirname(sourcePath);
  const root = path.resolve(configDir, raw.root);
  const relRoot = path.relative(cwd, root) || ".";

  const exclude =
    raw.exclude.length > 0 ? raw.exclude : defaultExcludes(raw.project.language as Language);

  const knownRoles =
    Object.keys(raw.contexts.auto.known_roles).length > 0
      ? raw.contexts.auto.known_roles
      : DEFAULT_KNOWN_ROLES;

  const contexts: ContextsConfig = {
    custom: raw.contexts.custom,
    minFiles: raw.contexts.auto.min_files,
    knownRoles,
  };

  const entities: EntitiesConfig = {
    topN: raw.entities.top_n,
    includeFields: raw.entities.include_fields,
    includePrivateMethods: raw.entities.include_private_methods,
    importance: {
      methodCount: raw.entities.importance.method_count,
      fieldCount: raw.entities.importance.field_count,
      inboundReferences: raw.entities.importance.inbound_references,
    },
  };

  const enums: EnumsConfig = { baseClasses: raw.enums.base_classes };

  const endpoints: EndpointsConfig = {
    framework: raw.endpoints.framework as Framework | null,
    routesModule: raw.endpoints.routes_module,
    appVar: raw.endpoints.app_var,
  };

  const storage: StorageConfig = {
    baseClass: raw.storage.base_class,
    migrationsDir: raw.storage.migrations_dir,
    lastN: raw.storage.last_n,
  };

  const interactions: InteractionsConfig = { dir: raw.interactions.dir };

  const workers: WorkersConfig = { patterns: raw.workers.patterns };

  const overview: OverviewConfig = { path: raw.overview.path };
  const output: OutputConfig = { markdown: raw.output.markdown, json: raw.output.json };

  const configHash = hashConfig(raw);

  return {
    project: {
      name: raw.project.name,
      language: raw.project.language as Language,
      frameworks: raw.project.frameworks as readonly Framework[],
    },
    root: relRoot,
    exclude,
    sections: raw.sections as ResolvedConfig["sections"],
    overview,
    contexts,
    entities,
    enums,
    endpoints,
    storage,
    interactions,
    workers,
    output,
    configHash,
    sourcePath,
  };
}

function hashConfig(raw: ConfigFile): string {
  const canonical = JSON.stringify(raw, Object.keys(raw).sort());
  return `sha256:${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}
