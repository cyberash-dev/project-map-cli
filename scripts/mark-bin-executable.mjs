import { chmodSync, statSync } from "node:fs";

/*
 * tsc emits 0644, and the `bin` entry is the emitted file itself. npm sets the
 * mode when it installs or links, so a rebuild under an existing link leaves a
 * binary the shell refuses to run until it is re-linked.
 */
const binPath = new URL("../dist/cli/index.js", import.meta.url);
const binMode = statSync(binPath).mode;
const executableMode = binMode | (0o111 & ~process.umask());

chmodSync(binPath, executableMode);
