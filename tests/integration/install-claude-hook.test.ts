import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	NodeFileReader,
	NodeFileWriter,
} from "../../src/infrastructure/filesystem/node-fs.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import {
	type ClaudeHookScope,
	InstallClaudeHookUseCase,
	type InstallClaudeHookResult,
} from "../../src/features/install-hooks/install-claude-hook.use-case.js";

function install(
	useCase: InstallClaudeHookUseCase,
	cwd: string,
	scope: ClaudeHookScope,
	force: boolean,
): Promise<InstallClaudeHookResult> {
	return useCase.execute({ cwd, scope, force });
}

interface HookEntry {
	type?: string;
	command?: string;
}

interface HookGroup {
	hooks: HookEntry[];
}

interface ClaudeSettings {
	theme?: string;
	hooks?: Record<string, HookGroup[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHookGroup(value: unknown): value is HookGroup {
	return (
		isRecord(value) && Array.isArray(value.hooks) && value.hooks.every(isRecord)
	);
}

function isClaudeSettings(value: unknown): value is ClaudeSettings {
	if (!isRecord(value)) {
		return false;
	}
	const { hooks } = value;
	if (hooks === undefined) {
		return true;
	}
	if (!isRecord(hooks)) {
		return false;
	}
	return Object.values(hooks).every(
		(groups) => Array.isArray(groups) && groups.every(isHookGroup),
	);
}

function parseSettings(raw: string): ClaudeSettings {
	const parsed: unknown = JSON.parse(raw);
	if (!isClaudeSettings(parsed)) {
		throw new Error("settings file did not match the expected shape");
	}
	return parsed;
}

async function readSettings(targetPath: string): Promise<ClaudeSettings> {
	return parseSettings(await readFile(targetPath, "utf8"));
}

function promptSubmitGroups(settings: ClaudeSettings): HookGroup[] {
	const groups = settings.hooks?.UserPromptSubmit;
	if (groups === undefined) {
		throw new Error("UserPromptSubmit groups are missing");
	}
	return groups;
}

function firstGroup(groups: HookGroup[]): HookGroup {
	const group = groups[0];
	if (group === undefined) {
		throw new Error("hook groups are empty");
	}
	return group;
}

function firstCommand(group: HookGroup): HookEntry {
	const entry = group.hooks[0];
	if (entry === undefined) {
		throw new Error("hook group has no entries");
	}
	return entry;
}

function settingsWithExistingHooks(): string {
	return JSON.stringify(
		{
			theme: "dark",
			hooks: {
				PreToolUse: [{ hooks: [{ type: "command", command: "echo pre" }] }],
				UserPromptSubmit: [
					{ hooks: [{ type: "command", command: "echo mine" }] },
				],
			},
		},
		null,
		2,
	);
}

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
		const result = await install(useCase, tmpDir, "project", false);
		expect(result.written).toBe(true);
		const settings = await readSettings(result.targetPath);
		const groups = promptSubmitGroups(settings);
		expect(groups).toHaveLength(1);
		const command = firstCommand(firstGroup(groups));
		expect(command.type).toBe("command");
		expect(command.command).toContain(
			"PROJECT_MAP.md is available at the repo root",
		);
	});

	it("is idempotent — second install without --force skips", async () => {
		await install(useCase, tmpDir, "project", false);
		const second = await install(useCase, tmpDir, "project", false);
		expect(second.written).toBe(false);
		expect(second.alreadyInstalled).toBe(true);
	});

	it("--force replaces the existing hook without duplicating", async () => {
		await install(useCase, tmpDir, "project", false);
		const second = await install(useCase, tmpDir, "project", true);
		expect(second.written).toBe(true);
		const settings = await readSettings(second.targetPath);
		expect(promptSubmitGroups(settings)).toHaveLength(1);
	});

	it("preserves unrelated hooks and top-level settings", async () => {
		const settingsPath = path.join(tmpDir, ".claude", "settings.json");
		await new NodeFileWriter().write(settingsPath, settingsWithExistingHooks());

		await install(useCase, tmpDir, "project", false);
		const settings = await readSettings(settingsPath);
		expect(settings.theme).toBe("dark");
		expect(settings.hooks?.PreToolUse).toHaveLength(1);
		const promptGroups = promptSubmitGroups(settings);
		expect(promptGroups).toHaveLength(2);
		expect(firstCommand(firstGroup(promptGroups)).command).toBe("echo mine");
	});

	it("installs to user scope under $HOME/.claude", async () => {
		const result = await install(useCase, tmpDir, "user", false);
		expect(result.targetPath).toBe(
			path.join(tmpDir, ".claude", "settings.json"),
		);
		expect(result.written).toBe(true);
	});

	it("bails on malformed JSON without overwriting", async () => {
		const settingsPath = path.join(tmpDir, ".claude", "settings.json");
		await new NodeFileWriter().write(settingsPath, "{ not valid json");
		const result = await install(useCase, tmpDir, "project", true);
		expect(result.written).toBe(false);
		const raw = await readFile(settingsPath, "utf8");
		expect(raw).toBe("{ not valid json");
	});
});
