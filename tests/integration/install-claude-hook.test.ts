import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeFileReader, NodeFileWriter } from "../../src/infrastructure/filesystem/node-fs.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { InstallClaudeHookUseCase } from "../../src/features/install-hooks/install-claude-hook.use-case.js";

describe("InstallClaudeHookUseCase", () => {
  let tmpDir: string;
  let useCase: InstallClaudeHookUseCase;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "claude-hook-"));
    useCase = new InstallClaudeHookUseCase({
      reader: new NodeFileReader(),
      writer: new NodeFileWriter(),
      logger: new ConsoleLogger(false),
      homeDir: () => tmpDir,
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates settings.json with the hook on fresh project install", async () => {
    const result = await useCase.execute({ cwd: tmpDir, scope: "project", force: false });
    expect(result.written).toBe(true);
    const settings = JSON.parse(await readFile(result.targetPath, "utf8"));
    const groups = settings.hooks.UserPromptSubmit;
    expect(groups).toHaveLength(1);
    expect(groups[0].hooks[0].type).toBe("command");
    expect(groups[0].hooks[0].command).toContain("PROJECT_MAP.md is available at the repo root");
  });

  it("is idempotent — second install without --force skips", async () => {
    await useCase.execute({ cwd: tmpDir, scope: "project", force: false });
    const second = await useCase.execute({ cwd: tmpDir, scope: "project", force: false });
    expect(second.written).toBe(false);
    expect(second.alreadyInstalled).toBe(true);
  });

  it("--force replaces the existing hook without duplicating", async () => {
    await useCase.execute({ cwd: tmpDir, scope: "project", force: false });
    const second = await useCase.execute({ cwd: tmpDir, scope: "project", force: true });
    expect(second.written).toBe(true);
    const settings = JSON.parse(await readFile(second.targetPath, "utf8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it("preserves unrelated hooks and top-level settings", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    await new NodeFileWriter().write(
      settingsPath,
      JSON.stringify(
        {
          theme: "dark",
          hooks: {
            PreToolUse: [{ hooks: [{ type: "command", command: "echo pre" }] }],
            UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo mine" }] }],
          },
        },
        null,
        2,
      ),
    );

    await useCase.execute({ cwd: tmpDir, scope: "project", force: false });
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(settings.theme).toBe("dark");
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe("echo mine");
  });

  it("installs to user scope under $HOME/.claude", async () => {
    const result = await useCase.execute({ cwd: tmpDir, scope: "user", force: false });
    expect(result.targetPath).toBe(path.join(tmpDir, ".claude", "settings.json"));
    expect(result.written).toBe(true);
  });

  it("bails on malformed JSON without overwriting", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    await new NodeFileWriter().write(settingsPath, "{ not valid json");
    const result = await useCase.execute({ cwd: tmpDir, scope: "project", force: true });
    expect(result.written).toBe(false);
    const raw = await readFile(settingsPath, "utf8");
    expect(raw).toBe("{ not valid json");
  });
});
