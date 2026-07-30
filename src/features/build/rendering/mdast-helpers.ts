import type {
	BlockContent,
	Blockquote,
	Code,
	DefinitionContent,
	Heading,
	InlineCode,
	List,
	ListItem,
	Paragraph,
	Root,
	Table,
	TableCell,
	TableRow,
	Text,
	ThematicBreak,
} from "mdast";

export type Alignment = "left" | "right" | "center" | null;

export function text(value: string): Text {
	return { type: "text", value };
}

export function inlineCode(value: string): InlineCode {
	return { type: "inlineCode", value };
}

export function paragraph(children: Array<Text | InlineCode>): Paragraph {
	return { type: "paragraph", children };
}

export function heading(depth: 1 | 2 | 3 | 4 | 5 | 6, value: string): Heading {
	return { type: "heading", depth, children: [text(value)] };
}

export function code(value: string, lang?: string): Code {
	return { type: "code", lang: lang ?? null, meta: null, value };
}

export function blockquote(
	children: Array<BlockContent | DefinitionContent>,
): Blockquote {
	return { type: "blockquote", children };
}

export function thematicBreak(): ThematicBreak {
	return { type: "thematicBreak" };
}

export function bulletList(
	items: Array<BlockContent | DefinitionContent | string>,
): List {
	const children: ListItem[] = items.map((item) => ({
		type: "listItem",
		spread: false,
		children:
			typeof item === "string"
				? [{ type: "paragraph", children: [text(item)] }]
				: [item],
	}));
	return { type: "list", ordered: false, spread: false, children };
}

export function inlineBulletList(items: readonly string[]): List {
	return bulletList([...items]);
}

/**
 * A cell holding a token the tool produced rather than prose. Inline code is
 * the honest node for one: the serializer neither escapes inside it nor reads
 * an underscore as emphasis, so a member named `__init__` survives as itself.
 */
export type CodeCell = { readonly code: string };

export type Cell = string | CodeCell;

/** An absent value has no token to quote, so it stays an empty cell. */
export function codeCell(value: string): Cell {
	return value.length === 0 ? value : { code: value };
}

export function table(
	headers: readonly string[],
	rows: readonly (readonly Cell[])[],
	align: readonly Alignment[] = [],
): Table {
	const tableRows: TableRow[] = [];
	tableRows.push({
		type: "tableRow",
		children: headers.map((h) => tableCell(h)),
	});
	for (const row of rows) {
		tableRows.push({
			type: "tableRow",
			children: row.map((cell) => tableCell(cell)),
		});
	}
	return { type: "table", align: [...align], children: tableRows };
}

function tableCell(value: Cell): TableCell {
	if (typeof value !== "string") {
		return { type: "tableCell", children: [inlineCode(value.code)] };
	}
	const escaped = value.replace(/\|/g, "\\|").replace(/\n/g, " ");
	return { type: "tableCell", children: [text(escaped)] };
}

export function section(title: string, depth: 2 | 3 | 4 = 2): Root["children"] {
	return [heading(depth, title)];
}
