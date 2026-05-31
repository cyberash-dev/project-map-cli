import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	NodeFileReader,
	NodeFileWriter,
} from "../../src/infrastructure/filesystem/node-fs.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { CLAUDE_SKILL_CONTENT } from "../../src/features/install-hooks/claude-skill.template.js";
import {
	type ClaudeSkillScope,
	InstallClaudeSkillUseCase,
	type InstallClaudeSkillResult,
} from "../../src/features/install-hooks/install-claude-skill.use-case.js";

function skillPath(root: string): string {
	return path.join(root, ".claude", "skills", "project-map", "SKILL.md");
}

function install(
	useCase: InstallClaudeSkillUseCase,
	cwd: string,
	scope: ClaudeSkillScope,
	force: boolean,
): Promise<InstallClaudeSkillResult> {
	return useCase.execute({ cwd, scope, force });
}

describe("InstallClaudeSkillUseCase", () => {
	let tmpDir: string;
	let useCase: InstallClaudeSkillUseCase;

	beforeEach(async () => {
		tmpDir = await mkdtemp(path.join(os.tmpdir(), "claude-skill-"));
		useCase = new InstallClaudeSkillUseCase({
			reader: new NodeFileReader(),
			writer: new NodeFileWriter(),
			logger: new ConsoleLogger(false),
			homeDir: () => tmpDir,
		});
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("writes the skill file on fresh project install", async () => {
		const result = await install(useCase, tmpDir, "project", false);
		expect(result.written).toBe(true);
		expect(result.targetPath).toBe(skillPath(tmpDir));
		const body = await readFile(result.targetPath, "utf8");
		expect(body).toBe(CLAUDE_SKILL_CONTENT);
		expect(body).toContain("name: project-map");
		expect(body).toContain("## 1. Preflight");
	});

	it("is idempotent — second install without --force skips", async () => {
		await install(useCase, tmpDir, "project", false);
		const second = await install(useCase, tmpDir, "project", false);
		expect(second.written).toBe(false);
		expect(second.alreadyInstalled).toBe(true);
	});

	it("--force rewrites a matching file without duplicating or losing content", async () => {
		await install(useCase, tmpDir, "project", false);
		const second = await install(useCase, tmpDir, "project", true);
		expect(second.written).toBe(true);
		const body = await readFile(second.targetPath, "utf8");
		expect(body).toBe(CLAUDE_SKILL_CONTENT);
	});

	it("installs to user scope under $HOME/.claude/skills/project-map", async () => {
		const result = await install(useCase, tmpDir, "user", false);
		expect(result.targetPath).toBe(skillPath(tmpDir));
		expect(result.written).toBe(true);
	});

	it("refuses to overwrite a differing existing SKILL.md without --force", async () => {
		const target = skillPath(tmpDir);
		await new NodeFileWriter().write(target, "--- user edits ---\n");
		const result = await install(useCase, tmpDir, "project", false);
		expect(result.written).toBe(false);
		expect(result.alreadyInstalled).toBe(false);
		const body = await readFile(target, "utf8");
		expect(body).toBe("--- user edits ---\n");
	});

	it("--force overwrites a differing existing SKILL.md", async () => {
		const target = skillPath(tmpDir);
		await new NodeFileWriter().write(target, "--- stale content ---\n");
		const result = await install(useCase, tmpDir, "project", true);
		expect(result.written).toBe(true);
		const body = await readFile(target, "utf8");
		expect(body).toBe(CLAUDE_SKILL_CONTENT);
	});
});
