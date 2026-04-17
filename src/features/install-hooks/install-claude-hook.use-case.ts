import * as path from "node:path";
import type { IFileReader, IFileWriter } from "../../core/ports/filesystem.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";

export type ClaudeHookScope = "project" | "user";

export type InstallClaudeHookArgs = {
  readonly cwd: string;
  readonly scope: ClaudeHookScope;
  readonly force: boolean;
};

export type InstallClaudeHookDeps = {
  readonly reader: IFileReader;
  readonly writer: IFileWriter;
  readonly logger: ILogger;
  readonly homeDir: () => string;
};

export type InstallClaudeHookResult = {
  readonly written: boolean;
  readonly targetPath: string;
  readonly alreadyInstalled: boolean;
};

const HOOK_SIGNATURE = "PROJECT_MAP.md is available at the repo root";

const HOOK_COMMAND = `bash -c 'if [ -f PROJECT_MAP.md ]; then echo "PROJECT_MAP.md is available at the repo root — a deterministic, AST-derived map of contexts, entities, enums, endpoints, storage, interactions, and workers. Read it before launching Explore or running broad Grep/Glob for cross-cutting questions."; fi'`;

type HookSpec = { readonly type: "command"; readonly command: string };
type MatcherGroup = { readonly matcher?: string; readonly hooks: HookSpec[] };
type Settings = {
  hooks?: {
    UserPromptSubmit?: MatcherGroup[];
    [otherEvent: string]: MatcherGroup[] | undefined;
  };
  [otherKey: string]: unknown;
};

export class InstallClaudeHookUseCase {
  constructor(private readonly deps: InstallClaudeHookDeps) {}

  async execute(args: InstallClaudeHookArgs): Promise<InstallClaudeHookResult> {
    const targetPath = this.resolveTarget(args);

    let settings: Settings = {};
    if (await this.deps.reader.exists(targetPath)) {
      const raw = await this.deps.reader.read(targetPath);
      if (raw.trim().length > 0) {
        try {
          settings = JSON.parse(raw) as Settings;
        } catch (err) {
          this.deps.logger.error(
            `${targetPath} is not valid JSON — fix it manually or delete the file. (${(err as Error).message})`,
          );
          return { written: false, targetPath, alreadyInstalled: false };
        }
      }
    }

    const hooks = (settings.hooks ??= {});
    const submitGroups = (hooks.UserPromptSubmit ??= []);

    const existingIdx = findProjectMapGroupIndex(submitGroups);
    if (existingIdx >= 0 && !args.force) {
      this.deps.logger.info(
        `project-map hook already present in ${targetPath} — pass --force to reinstall`,
      );
      return { written: false, targetPath, alreadyInstalled: true };
    }

    if (existingIdx >= 0) submitGroups.splice(existingIdx, 1);
    submitGroups.push({
      hooks: [{ type: "command", command: HOOK_COMMAND }],
    });

    await this.deps.writer.ensureDir(path.dirname(targetPath));
    await this.deps.writer.write(targetPath, `${JSON.stringify(settings, null, 2)}\n`);
    this.deps.logger.info(`installed project-map UserPromptSubmit hook → ${targetPath}`);
    this.deps.logger.info(
      "consider also adding a CLAUDE.md directive: 'Read PROJECT_MAP.md before broad Explore/Grep for cross-cutting questions.'",
    );
    return { written: true, targetPath, alreadyInstalled: existingIdx >= 0 };
  }

  private resolveTarget(args: InstallClaudeHookArgs): string {
    if (args.scope === "project") {
      return path.join(args.cwd, ".claude", "settings.json");
    }
    return path.join(this.deps.homeDir(), ".claude", "settings.json");
  }
}

function findProjectMapGroupIndex(groups: MatcherGroup[]): number {
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group || !Array.isArray(group.hooks)) continue;
    for (const h of group.hooks) {
      if (h && typeof h.command === "string" && h.command.includes(HOOK_SIGNATURE)) {
        return i;
      }
    }
  }
  return -1;
}
