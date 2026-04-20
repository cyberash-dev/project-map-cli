import { ALL_LANGUAGES } from "../core/domain/language.js";
import type { ResolvedConfig } from "../core/ports/config.port.js";
import { BuildProjectMapUseCase } from "../features/build/build.use-case.js";
import { SystemClock } from "../infrastructure/clock/system.js";
import { CosmiconfigLoader } from "../infrastructure/config/loader.js";
import { GlobbyWalker } from "../infrastructure/filesystem/globby-walker.js";
import { NodeFileReader, NodeFileWriter } from "../infrastructure/filesystem/node-fs.js";
import { ConsoleLogger } from "../infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../infrastructure/parser/tree-sitter.js";
import { GitRevisionProvider } from "../infrastructure/revision/git.js";
import { InitConfigUseCase } from "../features/init/init.use-case.js";
import { InstallClaudeHookUseCase } from "../features/install-hooks/install-claude-hook.use-case.js";
import { InstallClaudeSkillUseCase } from "../features/install-hooks/install-claude-skill.use-case.js";
import { InstallGitHookUseCase } from "../features/install-hooks/install-git-hook.use-case.js";
import { PrintVersionUseCase } from "../features/version/version.use-case.js";
import { chmod } from "node:fs/promises";
import { homedir } from "node:os";

export type Container = {
  toolVersion: string;
  logger: ConsoleLogger;
  reader: NodeFileReader;
  writer: NodeFileWriter;
  walker: GlobbyWalker;
  clock: SystemClock;
  revision: GitRevisionProvider;
  configLoader: CosmiconfigLoader;
  parser: TreeSitterParserRegistry;
};

export function createContainer(toolVersion: string, verbose: boolean): Container {
  const logger = new ConsoleLogger(verbose);
  return {
    toolVersion,
    logger,
    reader: new NodeFileReader(),
    writer: new NodeFileWriter(),
    walker: new GlobbyWalker(),
    clock: new SystemClock(),
    revision: new GitRevisionProvider(),
    configLoader: new CosmiconfigLoader(),
    parser: new TreeSitterParserRegistry(ALL_LANGUAGES, logger),
  };
}

export function buildUseCase(c: Container, config: ResolvedConfig): BuildProjectMapUseCase {
  return new BuildProjectMapUseCase({
    config,
    walker: c.walker,
    reader: c.reader,
    parser: c.parser,
    clock: c.clock,
    logger: c.logger,
    revision: c.revision,
    toolVersion: c.toolVersion,
  });
}

export function initUseCase(c: Container): InitConfigUseCase {
  return new InitConfigUseCase({
    configLoader: c.configLoader,
    reader: c.reader,
    logger: c.logger,
  });
}

export function versionUseCase(c: Container): PrintVersionUseCase {
  return new PrintVersionUseCase(c.toolVersion, c.parser);
}

export function installGitHookUseCase(c: Container): InstallGitHookUseCase {
  return new InstallGitHookUseCase({
    reader: c.reader,
    writer: c.writer,
    logger: c.logger,
    chmod: (p, m) => chmod(p, m),
  });
}

export function installClaudeHookUseCase(c: Container): InstallClaudeHookUseCase {
  return new InstallClaudeHookUseCase({
    reader: c.reader,
    writer: c.writer,
    logger: c.logger,
    homeDir: () => homedir(),
  });
}

export function installClaudeSkillUseCase(c: Container): InstallClaudeSkillUseCase {
  return new InstallClaudeSkillUseCase({
    reader: c.reader,
    writer: c.writer,
    logger: c.logger,
    homeDir: () => homedir(),
  });
}
