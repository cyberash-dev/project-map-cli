import type { ProjectMap } from "../../../core/domain/project-map.js";

export function renderJson(map: ProjectMap): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}
