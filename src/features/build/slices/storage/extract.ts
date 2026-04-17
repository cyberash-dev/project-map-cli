import type { Migration, Table } from "../../../../core/domain/project-map.js";
import type { IExtractor } from "../../extractor.port.js";
import type { ExtractionContext } from "../../extraction-context.js";
import { extractPythonAlembicMigrations } from "./adapters/python-alembic.js";
import { extractPythonSqlAlchemyTables } from "./adapters/python-sqlalchemy.js";
import { extractTypeScriptTables } from "./adapters/typescript-orm.js";

export type StorageResult = {
  tables: Table[];
  migrations: Migration[];
};

export class StorageExtractor implements IExtractor<StorageResult> {
  readonly name = "storage";

  async extract(ctx: ExtractionContext): Promise<StorageResult> {
    const tables: Table[] = [];
    const migrations: Migration[] = [];

    switch (ctx.language) {
      case "python": {
        tables.push(...(await extractPythonSqlAlchemyTables(ctx)));
        migrations.push(...(await extractPythonAlembicMigrations(ctx)));
        break;
      }
      case "typescript":
      case "javascript": {
        tables.push(...(await extractTypeScriptTables(ctx)));
        break;
      }
      default:
        break;
    }

    tables.sort((a, b) => a.table.localeCompare(b.table));
    migrations.sort((a, b) => a.revision.localeCompare(b.revision));
    return { tables, migrations: migrations.slice(-ctx.config.storage.lastN).reverse() };
  }
}
