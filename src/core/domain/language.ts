export type Language = "python" | "typescript" | "javascript" | "go" | "java" | "kotlin";

export const ALL_LANGUAGES: readonly Language[] = [
  "python",
  "typescript",
  "javascript",
  "go",
  "java",
  "kotlin",
] as const;

export function extensionsFor(language: Language): readonly string[] {
  switch (language) {
    case "python":
      return [".py"];
    case "typescript":
      return [".ts", ".tsx"];
    case "javascript":
      return [".js", ".jsx", ".mjs", ".cjs"];
    case "go":
      return [".go"];
    case "java":
      return [".java"];
    case "kotlin":
      return [".kt", ".kts"];
  }
}

export type Framework =
  | "aiohttp"
  | "fastapi"
  | "flask"
  | "django"
  | "sqlalchemy"
  | "alembic"
  | "express"
  | "fastify"
  | "koa"
  | "nestjs"
  | "typeorm"
  | "prisma"
  | "sequelize"
  | "net-http"
  | "gin"
  | "echo"
  | "chi"
  | "gorm"
  | "spring"
  | "jax-rs"
  | "ktor"
  | "hibernate"
  | "jpa";

export const FRAMEWORKS_BY_LANGUAGE: Readonly<Record<Language, readonly Framework[]>> = {
  python: ["aiohttp", "fastapi", "flask", "django", "sqlalchemy", "alembic"],
  typescript: ["express", "fastify", "koa", "nestjs", "typeorm", "prisma", "sequelize"],
  javascript: ["express", "fastify", "koa", "sequelize"],
  go: ["net-http", "gin", "echo", "chi", "gorm"],
  java: ["spring", "jax-rs", "hibernate", "jpa"],
  kotlin: ["spring", "ktor", "hibernate", "jpa"],
};
