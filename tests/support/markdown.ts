/** Reads a rendered table back out of the document, unescaping prose cells. */
export function tableRows(markdown: string, heading: string): string[][] {
	const after = markdown.slice(markdown.indexOf(heading)).split("\n");
	const first = after.findIndex((line) => line.startsWith("|"));
	const rows: string[][] = [];
	for (const line of after.slice(first)) {
		if (!line.startsWith("|")) {
			break;
		}
		rows.push(
			line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim().replace(/\\(.)/g, "$1")),
		);
	}
	return rows;
}

export function headerRow(markdown: string, heading: string): string[] {
	return tableRows(markdown, heading)[0] ?? [];
}

export function bodyRows(markdown: string, heading: string): string[][] {
	return tableRows(markdown, heading).slice(2);
}
