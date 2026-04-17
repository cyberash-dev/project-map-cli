import type {
  Blockquote,
  Code,
  Heading,
  InlineCode,
  List,
  ListItem,
  Paragraph,
  Root,
  RootContent,
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

export function blockquote(children: RootContent[]): Blockquote {
  return { type: "blockquote", children } as Blockquote;
}

export function thematicBreak(): ThematicBreak {
  return { type: "thematicBreak" };
}

export function bulletList(items: Array<RootContent | string>): List {
  const children: ListItem[] = items.map((item) => ({
    type: "listItem",
    spread: false,
    children:
      typeof item === "string"
        ? [{ type: "paragraph", children: [text(item)] }]
        : [item as any],
  }));
  return { type: "list", ordered: false, spread: false, children };
}

export function inlineBulletList(items: readonly string[]): List {
  return bulletList([...items]);
}

export function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
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

function tableCell(value: string): TableCell {
  const escaped = value.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return { type: "tableCell", children: [text(escaped)] };
}

export function section(title: string, depth: 2 | 3 | 4 = 2): Root["children"] {
  return [heading(depth, title)];
}
