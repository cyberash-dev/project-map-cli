export type ClaudeHookScope = "project" | "user";

export class PrintClaudeHookUseCase {
  render(scope: ClaudeHookScope): string {
    const target =
      scope === "project" ? ".claude/settings.json (project-scoped)" : "~/.claude/settings.json";
    return `# Claude Code integration

Add the following to ${target}. The hook fires on every user prompt and injects a
reminder that PROJECT_MAP.md is the authoritative structural reference for
this repo, so the agent reads it before firing broad Explore/Grep queries.

{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if [ -f PROJECT_MAP.md ]; then echo \\"PROJECT_MAP.md is available at the repo root — a deterministic, AST-derived map of contexts, entities, enums, endpoints, storage, interactions, and workers. Read it before launching Explore or running broad Grep/Glob for cross-cutting questions.\\"; fi'"
          }
        ]
      }
    ]
  }
}

Optional: drop the following directive into your project's CLAUDE.md so it
loads automatically and binds even without the hook:

## Cross-cutting questions

PROJECT_MAP.md at the repo root is the authoritative structural reference. Before
running Explore, Grep, or Glob for "how does X work across services / modules",
read PROJECT_MAP.md first. It lists contexts, domain entities with inheritance,
enums with members, HTTP endpoints, storage tables, migrations, external-service
clients, and workers — deterministic, AST-derived, no LLM guesses.

If PROJECT_MAP.md does not answer the question, then fall back to Explore/LSP.
`;
  }
}
