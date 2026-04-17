import type { Root, RootContent } from "mdast";
import type { Migration, Table } from "../../../../core/domain/project-map.js";
import { heading, section, table } from "../../rendering/mdast-helpers.js";

export function renderStorage(storage: {
  readonly tables: readonly Table[];
  readonly migrations: readonly Migration[];
}): Root["children"] {
  const out: RootContent[] = [];
  if (storage.tables.length === 0 && storage.migrations.length === 0) return out;
  out.push(...section("Storage", 2));
  if (storage.tables.length > 0) {
    out.push(heading(3, "Tables"));
    out.push(
      table(
        ["Table", "Model", "Source"],
        storage.tables.map((t) => [t.table, t.model, `${t.source.file}:${t.source.line}`]),
        ["left", "left", "left"],
      ),
    );
  }
  if (storage.migrations.length > 0) {
    out.push(heading(3, `Migrations (last ${storage.migrations.length})`));
    out.push(
      table(
        ["Revision", "Touched tables", "Summary"],
        storage.migrations.map((m) => [
          m.revision,
          m.tables.join(", "),
          m.summary,
        ]),
        ["left", "left", "left"],
      ),
    );
  }
  return out;
}
