import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { IFileReader, IFileWriter } from "../../core/ports/filesystem.port.js";

export class NodeFileReader implements IFileReader {
  async read(absPath: string): Promise<string> {
    return await readFile(absPath, "utf8");
  }

  async exists(absPath: string): Promise<boolean> {
    try {
      await access(absPath);
      return true;
    } catch {
      return false;
    }
  }
}

export class NodeFileWriter implements IFileWriter {
  async write(absPath: string, content: string): Promise<void> {
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  async ensureDir(absPath: string): Promise<void> {
    await mkdir(absPath, { recursive: true });
  }
}
