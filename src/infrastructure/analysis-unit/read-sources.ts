import type { UnitSource } from "../../core/ports/analysis-unit.port.js";
import type {
	IFileReader,
	IFileWalker,
	WalkOptions,
} from "../../core/ports/filesystem.port.js";

export type SourceSetRequest = {
	readonly walker: IFileWalker;
	readonly reader: IFileReader;
	readonly selection: WalkOptions;
};

/**
 * The one place source content is read. Both halves of a build go through it —
 * extraction with the document's selection, detection with the analysis unit's
 * — and both receive a path-to-text map holding no absolute path, so neither
 * can depend on where the checkout sits.
 */
export async function readSourceSet(
	request: SourceSetRequest,
): Promise<readonly UnitSource[]> {
	const discovered = await request.walker.walk(request.selection);
	const sources: UnitSource[] = [];
	for (const file of discovered) {
		sources.push({
			path: file.relPath,
			text: await request.reader.read(file.absPath),
		});
	}
	return sources;
}
