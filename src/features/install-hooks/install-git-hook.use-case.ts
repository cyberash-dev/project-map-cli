import * as path from "node:path";
import type { IFileReader, IFileWriter } from "../../core/ports/filesystem.port.js";
import type { ILogger } from "../../core/ports/logger.port.js";

export type GitHookType = "pre-push" | "pre-commit";

export type InstallGitHookArgs = {
  readonly cwd: string;
  readonly type: GitHookType;
  readonly force: boolean;
};

export type InstallGitHookDeps = {
  readonly reader: IFileReader;
  readonly writer: IFileWriter;
  readonly logger: ILogger;
  readonly chmod: (absPath: string, mode: number) => Promise<void>;
};

export type InstallGitHookResult = {
  readonly written: boolean;
  readonly targetPath: string;
  readonly installed: boolean;
};

export class InstallGitHookUseCase {
  constructor(private readonly deps: InstallGitHookDeps) {}

  async execute(args: InstallGitHookArgs): Promise<InstallGitHookResult> {
    const gitDir = path.resolve(args.cwd, ".git");
    if (!(await this.deps.reader.exists(gitDir))) {
      this.deps.logger.error(".git/ not found in cwd — run inside a git working copy");
      return { written: false, targetPath: "", installed: false };
    }

    const hooksDir = path.resolve(args.cwd, ".git/hooks");
    const targetPath = path.join(hooksDir, args.type);
    const exists = await this.deps.reader.exists(targetPath);
    if (exists && !args.force) {
      this.deps.logger.warn(
        `${targetPath} already exists; pass --force to overwrite or edit the file manually`,
      );
      return { written: false, targetPath, installed: true };
    }

    await this.deps.writer.ensureDir(hooksDir);
    await this.deps.writer.write(targetPath, HOOK_SCRIPT);
    await this.deps.chmod(targetPath, 0o755);
    this.deps.logger.info(`installed git ${args.type} hook at ${targetPath}`);
    return { written: true, targetPath, installed: true };
  }
}

const HOOK_SCRIPT = `#!/usr/bin/env bash
# project-map hook — keeps PROJECT_MAP.md in sync with the code.
# Installed by \`project-map install-git-hook\`. Safe to re-run; exits 0 when
# the project does not opt in (no .project-map.yaml present).
set -euo pipefail

# Skip silently if the project doesn't use project-map.
if [ ! -f .project-map.yaml ] && [ ! -f .project-map.yml ] && [ ! -f .project-map.json ]; then
  exit 0
fi

# Locate the binary: prefer local install, fall back to PATH.
BIN=""
if [ -x node_modules/.bin/project-map ]; then
  BIN="node_modules/.bin/project-map"
elif command -v project-map >/dev/null 2>&1; then
  BIN="$(command -v project-map)"
else
  echo "project-map: .project-map.yaml present but 'project-map' is not installed; skipping hook." >&2
  exit 0
fi

if ! "$BIN" build --check; then
  cat >&2 <<'MSG'

  PROJECT_MAP.md is out of date. Regenerate and stage it:

    project-map build
    git add PROJECT_MAP.md

  Skip this gate for one commit with SKIP_PROJECT_MAP_HOOK=1.

MSG
  if [ "\${SKIP_PROJECT_MAP_HOOK:-0}" = "1" ]; then
    echo "project-map: SKIP_PROJECT_MAP_HOOK=1 set, letting this through." >&2
    exit 0
  fi
  exit 1
fi
`;
