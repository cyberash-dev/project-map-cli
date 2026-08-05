import type { Root, RootContent } from "mdast";
import type { Migration, Table } from "../../../../core/domain/project-map.js";
import {
	codeCell,
	heading,
	section,
	table,
} from "../../rendering/mdast-helpers.js";

export function renderStorage(storage: {
	readonly tables: readonly Table[];
	readonly migrations: readonly Migration[];
}): Root["children"] {
	const out: RootContent[] = [];
	if (storage.tables.length === 0 && storage.migrations.length === 0) {
		return out;
	}
	out.push(...section("Storage", 2));
	if (storage.tables.length > 0) {
		out.push(heading(3, "Tables"));
		out.push(
			table(
				["Table", "Model", "Source"],
				storage.tables.map((t) => [
					codeCell(t.table),
					codeCell(t.model),
					codeCell(t.source.file),
				]),
				["left", "left", "left"],
			),
		);
	}
	if (storage.migrations.length > 0) {
		out.push(heading(3, "Recent migrations"));
		out.push(
			table(
				["Revision", "Touched tables", "Summary"],
				storage.migrations.map((m) => [
					codeCell(m.revision),
					codeCell(m.tables.join(", ")),
					codeCell(m.summary),
				]),
				["left", "left", "left"],
			),
		);
	}
	return out;
}
