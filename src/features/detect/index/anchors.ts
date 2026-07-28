const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

export type ByteOffsetTable = {
	byteOffsetAt(utf16Index: number): number;
};

/**
 * Maps a UTF-16 code-unit index to a UTF-8 byte offset in one pass.
 * tree-sitter reports `startIndex` in code units while a source anchor is
 * defined over bytes; on non-ASCII source the two diverge and a code-unit
 * index cuts a character in half.
 */
export function byteOffsetTable(source: string): ByteOffsetTable {
	const prefix = new Uint32Array(source.length + 1);
	let total = 0;
	for (let index = 0; index < source.length; index++) {
		prefix[index] = total;
		total += byteLengthOfUnitAt(source, index);
	}
	prefix[source.length] = total;

	return {
		byteOffsetAt(utf16Index: number): number {
			const offset = prefix[utf16Index];
			if (offset === undefined) {
				throw new RangeError(
					`utf16 index ${utf16Index} is out of range for a source of ${source.length} code unit(s)`,
				);
			}
			return offset;
		},
	};
}

/**
 * A surrogate pair costs four bytes in total. Charging them to the high half
 * and nothing to the low half keeps the prefix sums exact at every boundary an
 * anchor can legally fall on.
 */
function byteLengthOfUnitAt(source: string, index: number): number {
	const unit = source.charCodeAt(index);
	if (unit < 0x80) {
		return 1;
	}
	if (unit < 0x800) {
		return 2;
	}
	if (unit >= HIGH_SURROGATE_START && unit <= HIGH_SURROGATE_END) {
		return isLowSurrogateAt(source, index + 1) ? 4 : 3;
	}
	if (unit >= LOW_SURROGATE_START && unit <= LOW_SURROGATE_END) {
		return isHighSurrogateAt(source, index - 1) ? 0 : 3;
	}
	return 3;
}

function isLowSurrogateAt(source: string, index: number): boolean {
	const unit = source.charCodeAt(index);
	return unit >= LOW_SURROGATE_START && unit <= LOW_SURROGATE_END;
}

function isHighSurrogateAt(source: string, index: number): boolean {
	if (index < 0) {
		return false;
	}
	const unit = source.charCodeAt(index);
	return unit >= HIGH_SURROGATE_START && unit <= HIGH_SURROGATE_END;
}
