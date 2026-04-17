export const FACTORIES_BY_FRAMEWORK: Readonly<Record<string, readonly string[]>> = {
  express: ["express", "Router", "express.Router"],
  fastify: ["Fastify", "fastify"],
};

export function isTsFramework(framework: string): boolean {
  return framework in FACTORIES_BY_FRAMEWORK;
}
