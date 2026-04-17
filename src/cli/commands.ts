import { createRequire } from "node:module";
import * as path from "node:path";
import { Command } from "commander";
import { renderJson } from "../features/build/rendering/json.js";
import { renderMarkdown } from "../features/build/rendering/markdown.js";
import {
  buildUseCase,
  createContainer,
  initUseCase,
  installClaudeHookUseCase,
  installGitHookUseCase,
  versionUseCase,
} from "./container.js";
import type { Framework, Language } from "../core/domain/language.js";
import { ALL_LANGUAGES, FRAMEWORKS_BY_LANGUAGE } from "../core/domain/language.js";
import { SECTION_IDS, type SectionId } from "../core/domain/project-map.js";

const require = createRequire(import.meta.url);
const TOOL_VERSION = (require("../../package.json") as { version: string }).version;

const ALL_FRAMEWORKS = Array.from(new Set(Object.values(FRAMEWORKS_BY_LANGUAGE).flat()));

export function createProgram(): Command {
  const program = new Command()
    .name("project-map")
    .description("Generate a deterministic PROJECT_MAP.md architectural map.")
    .version(TOOL_VERSION, "-V, --version-number");

  program
    .command("init")
    .description("Scaffold a default .project-map.yaml in the current directory.")
    .option("--lang <language>", `language (${ALL_LANGUAGES.join("|")})`, "python")
    .option("--framework <framework>", `framework (${ALL_FRAMEWORKS.join("|")})`)
    .option("--force", "overwrite existing config", false)
    .action(async (opts) => {
      const container = createContainer(TOOL_VERSION, false);
      const useCase = initUseCase(container);
      const language = assertLanguage(opts.lang);
      const framework = opts.framework ? assertFramework(opts.framework) : null;
      const result = await useCase.execute({
        cwd: process.cwd(),
        language,
        framework,
        force: Boolean(opts.force),
      });
      if (!result.written) process.exitCode = 1;
    });

  program
    .command("build")
    .description("Build PROJECT_MAP.md and optional JSON output.")
    .option("--config <path>", "explicit path to .project-map.yaml")
    .option("--out <path>", "override output path")
    .option("--only <sections>", "comma-separated section IDs to include")
    .option("--json [path]", "also emit JSON output (path optional)")
    .option("--check", "exit 1 if output differs from existing file", false)
    .option("--verbose", "verbose logging", false)
    .action(async (opts) => {
      const container = createContainer(TOOL_VERSION, Boolean(opts.verbose));
      const config = await container.configLoader.load(process.cwd(), opts.config ?? null);
      if (!config) {
        container.logger.error(
          "no .project-map.yaml found. Run `project-map init` to create one.",
        );
        process.exitCode = 2;
        return;
      }
      const effectiveConfig = applyOnly(
        applyOutputOverrides(config, opts.out, opts.json),
        opts.only,
      );
      const useCase = buildUseCase(container, effectiveConfig);
      const { map, projectRoot } = await useCase.execute(process.cwd());
      const markdown = renderMarkdown(map, effectiveConfig);
      const mdPath = path.resolve(projectRoot, effectiveConfig.output.markdown);

      if (opts.check) {
        const existing = (await container.reader.exists(mdPath))
          ? await container.reader.read(mdPath)
          : "";
        const normExisting = stripMetadata(existing);
        const normNew = stripMetadata(markdown);
        if (normExisting === normNew) {
          container.logger.info("PROJECT_MAP.md is up to date.");
          return;
        }
        process.stderr.write("PROJECT_MAP.md is out of date.\n");
        process.exitCode = 1;
        return;
      }

      await container.writer.write(mdPath, markdown);
      container.logger.info(`wrote ${mdPath}`);
      if (effectiveConfig.output.json) {
        const jsonPath = path.resolve(projectRoot, effectiveConfig.output.json);
        await container.writer.write(jsonPath, renderJson(map));
        container.logger.info(`wrote ${jsonPath}`);
      }
    });

  program
    .command("version")
    .description("Print tool version and supported languages.")
    .action(() => {
      const container = createContainer(TOOL_VERSION, false);
      const v = versionUseCase(container);
      process.stdout.write(v.render());
    });

  program
    .command("install-git-hook")
    .description("Install a git hook that gates commits/pushes on `build --check`.")
    .option("--type <type>", "pre-push | pre-commit", "pre-push")
    .option("--force", "overwrite existing hook", false)
    .action(async (opts) => {
      const container = createContainer(TOOL_VERSION, false);
      const useCase = installGitHookUseCase(container);
      if (opts.type !== "pre-push" && opts.type !== "pre-commit") {
        process.stderr.write(`invalid --type: ${opts.type}. Expected pre-push or pre-commit.\n`);
        process.exitCode = 1;
        return;
      }
      const result = await useCase.execute({
        cwd: process.cwd(),
        type: opts.type,
        force: Boolean(opts.force),
      });
      if (!result.written) process.exitCode = 1;
    });

  program
    .command("install-claude-hook")
    .description("Install a Claude Code UserPromptSubmit hook that points the agent at PROJECT_MAP.md.")
    .option("--scope <scope>", "project | user", "project")
    .option("--force", "reinstall even if already present", false)
    .action(async (opts) => {
      const scope = opts.scope === "user" ? "user" : "project";
      const container = createContainer(TOOL_VERSION, false);
      const useCase = installClaudeHookUseCase(container);
      const result = await useCase.execute({
        cwd: process.cwd(),
        scope,
        force: Boolean(opts.force),
      });
      if (!result.written && !result.alreadyInstalled) process.exitCode = 1;
    });

  program
    .command("watch")
    .description("Not yet implemented — planned for v2.")
    .action(() => {
      process.stderr.write("watch mode is not yet implemented.\n");
      process.exitCode = 1;
    });

  return program;
}

function applyOutputOverrides(
  cfg: Awaited<ReturnType<ReturnType<typeof createContainer>["configLoader"]["load"]>> & object,
  outArg: string | undefined,
  jsonArg: string | boolean | undefined,
): typeof cfg {
  const markdown = outArg ?? cfg.output.markdown;
  let json: string | null = cfg.output.json;
  if (jsonArg === true) json = "project-map.json";
  else if (typeof jsonArg === "string") json = jsonArg;
  return { ...cfg, output: { markdown, json } };
}

function applyOnly<T extends { sections: readonly SectionId[] }>(cfg: T, onlyArg: string | undefined): T {
  if (!onlyArg) return cfg;
  const requested = onlyArg
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as SectionId[];
  const allowed = new Set<SectionId>(requested);
  return { ...cfg, sections: SECTION_IDS.filter((s) => allowed.has(s)) };
}

function stripMetadata(content: string): string {
  return content
    .replace(/^Generated by project-map v.+$/m, "Generated by project-map")
    .replace(/^\| Build duration\s*\|.*\|$/m, "| Build duration | <normalized> |");
}

function assertLanguage(value: string): Language {
  if ((ALL_LANGUAGES as readonly string[]).includes(value)) return value as Language;
  throw new Error(`invalid language: ${value}. Expected one of ${ALL_LANGUAGES.join(", ")}`);
}

function assertFramework(value: string): Framework {
  if (ALL_FRAMEWORKS.includes(value as Framework)) return value as Framework;
  throw new Error(`invalid framework: ${value}. Expected one of ${ALL_FRAMEWORKS.join(", ")}`);
}
