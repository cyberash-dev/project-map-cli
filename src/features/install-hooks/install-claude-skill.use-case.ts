import * as path from "node:path";
import type { IFileReader, IFileWriter } from "../../core/ports/filesystem.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";
import { CLAUDE_SKILL_CONTENT } from "./claude-skill.template.js";

export type ClaudeSkillScope = "project" | "user";

export type InstallClaudeSkillArgs = {
  readonly cwd: string;
  readonly scope: ClaudeSkillScope;
  readonly force: boolean;
};

export type InstallClaudeSkillDeps = {
  readonly reader: IFileReader;
  readonly writer: IFileWriter;
  readonly logger: ILogger;
  readonly homeDir: () => string;
};

export type InstallClaudeSkillResult = {
  readonly written: boolean;
  readonly targetPath: string;
  readonly alreadyInstalled: boolean;
};

export class InstallClaudeSkillUseCase {
  constructor(private readonly deps: InstallClaudeSkillDeps) {}

  async execute(args: InstallClaudeSkillArgs): Promise<InstallClaudeSkillResult> {
    const targetPath = this.resolveTarget(args);

    if (await this.deps.reader.exists(targetPath)) {
      const existing = await this.deps.reader.read(targetPath);
      const matchesTemplate = existing === CLAUDE_SKILL_CONTENT;
      if (matchesTemplate && !args.force) {
        this.deps.logger.info(
          `project-map skill already present at ${targetPath} — pass --force to reinstall`,
        );
        return { written: false, targetPath, alreadyInstalled: true };
      }
      if (!matchesTemplate && !args.force) {
        this.deps.logger.warn(
          `${targetPath} exists but differs from the bundled template — pass --force to overwrite`,
        );
        return { written: false, targetPath, alreadyInstalled: false };
      }
    }

    await this.deps.writer.ensureDir(path.dirname(targetPath));
    await this.deps.writer.write(targetPath, CLAUDE_SKILL_CONTENT);
    this.deps.logger.info(`installed project-map skill → ${targetPath}`);
    return { written: true, targetPath, alreadyInstalled: false };
  }

  private resolveTarget(args: InstallClaudeSkillArgs): string {
    const root = args.scope === "project" ? args.cwd : this.deps.homeDir();
    return path.join(root, ".claude", "skills", "project-map", "SKILL.md");
  }
}
