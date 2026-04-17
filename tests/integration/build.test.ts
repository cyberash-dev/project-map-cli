import { readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALL_LANGUAGES } from "../../src/core/domain/language.js";
import { BuildProjectMapUseCase } from "../../src/features/build/build.use-case.js";
import { renderMarkdown } from "../../src/features/build/rendering/markdown.js";
import { SystemClock } from "../../src/infrastructure/clock/system.js";
import { CosmiconfigLoader } from "../../src/infrastructure/config/loader.js";
import { GlobbyWalker } from "../../src/infrastructure/filesystem/globby-walker.js";
import { NodeFileReader } from "../../src/infrastructure/filesystem/node-fs.js";
import { ConsoleLogger } from "../../src/infrastructure/logger/console.js";
import { TreeSitterParserRegistry } from "../../src/infrastructure/parser/tree-sitter.js";
import { GitRevisionProvider } from "../../src/infrastructure/revision/git.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, "../fixtures/python-aiohttp-minimal");
const TS_FIXTURE = path.resolve(HERE, "../fixtures/typescript-express-minimal");
const PROTO_FIXTURE = path.resolve(HERE, "../fixtures/javascript-prototype-minimal");
const GITIGNORE_FIXTURE = path.resolve(HERE, "../fixtures/javascript-gitignore-minimal");

describe("python-aiohttp-minimal fixture", () => {
  it("extracts entities, enums, endpoints, storage, workers, interactions", async () => {
    const logger = new ConsoleLogger(false);
    const loader = new CosmiconfigLoader();
    const config = await loader.load(FIXTURE, null);
    expect(config).not.toBeNull();
    if (!config) return;

    const parser = new TreeSitterParserRegistry(ALL_LANGUAGES, logger);

    const useCase = new BuildProjectMapUseCase({
      config,
      walker: new GlobbyWalker(),
      reader: new NodeFileReader(),
      parser,
      clock: new SystemClock(),
      logger,
      revision: new GitRevisionProvider(),
      toolVersion: "test",
    });

    const { map } = await useCase.execute(FIXTURE);

    expect(map.metadata.errors).toEqual([]);
    expect(map.contexts.map((c) => c.path)).toContain("handlers");
    expect(map.entities.some((e) => e.name === "Transaction")).toBe(true);
    expect(map.enums.some((e) => e.name === "TransactionStatus")).toBe(true);
    const statusEnum = map.enums.find((e) => e.name === "TransactionStatus");
    expect(statusEnum?.members).toEqual([
      "NEW",
      "PENDING",
      "AUTHORIZED",
      "CHARGED",
      "FAILED",
      "REFUNDED",
    ]);
    expect(map.endpoints.some((e) => e.method === "POST" && e.path === "/api/v1/transactions")).toBe(true);
    expect(map.storage.tables.some((t) => t.table === "transactions")).toBe(true);
    expect(map.storage.migrations.length).toBe(2);
    expect(map.interactions.some((i) => i.clientClass === "PayTransactionsClient")).toBe(true);
    expect(map.workers.some((w) => w.name === "TransactionEventWorker")).toBe(true);

    const md = renderMarkdown(map, config);
    expect(md).toContain("## Bounded contexts");
    expect(md).toContain("## Enums");
    expect(md).toContain("TransactionStatus");
  });

  it("is deterministic across runs modulo timestamp", async () => {
    const logger = new ConsoleLogger(false);
    const loader = new CosmiconfigLoader();
    const config = await loader.load(FIXTURE, null);
    if (!config) throw new Error("config missing");
    const parser = new TreeSitterParserRegistry(ALL_LANGUAGES, logger);
    const deps = {
      config,
      walker: new GlobbyWalker(),
      reader: new NodeFileReader(),
      parser,
      clock: new SystemClock(),
      logger,
      revision: new GitRevisionProvider(),
      toolVersion: "test",
    };
    const a = renderMarkdown((await new BuildProjectMapUseCase(deps).execute(FIXTURE)).map, config);
    const b = renderMarkdown((await new BuildProjectMapUseCase(deps).execute(FIXTURE)).map, config);
    expect(stripTimestamps(a)).toEqual(stripTimestamps(b));
  });
});

describe("typescript-express-minimal fixture", () => {
  it("extracts express router endpoints and rejects non-framework .get/.post calls", async () => {
    const logger = new ConsoleLogger(false);
    const loader = new CosmiconfigLoader();
    const config = await loader.load(TS_FIXTURE, null);
    expect(config).not.toBeNull();
    if (!config) return;

    const parser = new TreeSitterParserRegistry(ALL_LANGUAGES, logger);
    const useCase = new BuildProjectMapUseCase({
      config,
      walker: new GlobbyWalker(),
      reader: new NodeFileReader(),
      parser,
      clock: new SystemClock(),
      logger,
      revision: new GitRevisionProvider(),
      toolVersion: "test",
    });

    const { map } = await useCase.execute(TS_FIXTURE);

    expect(map.metadata.errors).toEqual([]);

    const routerEndpoints = map.endpoints.filter((e) => e.source.file === "handlers/users.ts");
    expect(routerEndpoints).toHaveLength(3);
    expect(routerEndpoints.find((e) => e.method === "GET")?.path).toBe("/users");
    expect(routerEndpoints.find((e) => e.method === "POST")?.path).toBe("/users");
    expect(routerEndpoints.find((e) => e.method === "DELETE")?.path).toBe("/users/:id");

    const noiseEndpoints = map.endpoints.filter((e) => e.source.file === "handlers/noise.ts");
    expect(noiseEndpoints).toEqual([]);
  });
});

describe("javascript-prototype-minimal fixture", () => {
  it("extracts prototype-based entities and honors contexts.auto.depth", async () => {
    const logger = new ConsoleLogger(false);
    const loader = new CosmiconfigLoader();
    const config = await loader.load(PROTO_FIXTURE, null);
    expect(config).not.toBeNull();
    if (!config) return;

    const parser = new TreeSitterParserRegistry(ALL_LANGUAGES, logger);
    const useCase = new BuildProjectMapUseCase({
      config,
      walker: new GlobbyWalker(),
      reader: new NodeFileReader(),
      parser,
      clock: new SystemClock(),
      logger,
      revision: new GitRevisionProvider(),
      toolVersion: "test",
    });

    const { map } = await useCase.execute(PROTO_FIXTURE);

    expect(map.metadata.errors).toEqual([]);

    const contextPaths = map.contexts.map((c) => c.path).sort();
    expect(contextPaths).toEqual(["src/domain/models", "src/domain/registries"]);

    const byName = new Map(map.entities.map((e) => [e.name, e]));
    expect(byName.has("Animal")).toBe(true);
    expect(byName.has("Dog")).toBe(true);
    expect(byName.has("Registry")).toBe(true);

    expect(byName.get("Dog")?.inherits).toEqual(["Animal"]);
    expect(byName.get("Animal")?.methods).toEqual(["speak", "toString"]);
    expect(byName.get("Registry")?.methods).toEqual(["add", "get", "remove"]);
  });
});

describe("javascript-gitignore-minimal fixture", () => {
  const ignoredPath = path.join(GITIGNORE_FIXTURE, "src/generated.js");

  beforeAll(async () => {
    await writeFile(ignoredPath, "export function gen() { return 1; }\n", "utf8");
  });
  afterAll(async () => {
    await rm(ignoredPath, { force: true });
  });

  it("skips files matched by .gitignore when respect_gitignore is true", async () => {
    const logger = new ConsoleLogger(false);
    const loader = new CosmiconfigLoader();
    const config = await loader.load(GITIGNORE_FIXTURE, null);
    expect(config).not.toBeNull();
    if (!config) return;
    expect(config.respectGitignore).toBe(true);

    const parser = new TreeSitterParserRegistry(ALL_LANGUAGES, logger);
    const useCase = new BuildProjectMapUseCase({
      config,
      walker: new GlobbyWalker(),
      reader: new NodeFileReader(),
      parser,
      clock: new SystemClock(),
      logger,
      revision: new GitRevisionProvider(),
      toolVersion: "test",
    });

    const { map } = await useCase.execute(GITIGNORE_FIXTURE);
    expect(map.metadata.scannedFiles).toBe(1);
  });
});

function stripTimestamps(md: string): string {
  return md
    .replace(/Generated by project-map v.+$/m, "X")
    .replace(/Build duration \| \d+ ms/, "Build duration | X")
    .replace(/from revision [^\s]+/, "");
}

it.skip("reads artifact", async () => {
  const p = path.join(FIXTURE, "PROJECT_MAP.md");
  const s = await readFile(p, "utf8");
  expect(s.length).toBeGreaterThan(0);
});
