#!/usr/bin/env node
import { createProgram } from "./commands.js";

async function main(): Promise<void> {
	const program = createProgram();
	await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
	const detail =
		err instanceof Error ? (err.stack ?? err.message) : String(err);
	process.stderr.write(`fatal: ${detail}\n`);
	process.exit(1);
});
