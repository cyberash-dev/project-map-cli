/**
 * A byte range over the UTF-8 source bytes of the analysis unit.
 *
 * Offsets are UTF-8 byte offsets, not UTF-16 code-unit indices: tree-sitter
 * reports the latter, and the two diverge on any non-ASCII source.
 */
export type SourceAnchor = {
	readonly path: string;
	readonly start_byte: number;
	readonly end_byte: number;
};

export type EvidenceRole =
	| "registration"
	| "call"
	| "inventory"
	| "declaration";

export type Evidence = SourceAnchor & {
	readonly role: EvidenceRole;
};

/**
 * A reference to a declared symbol. Equality is decided by the declaration
 * anchor alone; `display_name` is human-facing and an alias or a re-export
 * resolves to the original declaration.
 */
export type SymbolValue = {
	readonly kind: "symbol";
	readonly declaration: SourceAnchor;
	readonly display_name: string;
};
