import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { IRevisionProvider } from "../../core/ports/revision.port.js";

const execAsync = promisify(exec);

export class GitRevisionProvider implements IRevisionProvider {
  async current(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --short HEAD", { cwd, timeout: 2000 });
      const v = stdout.trim();
      return v.length > 0 ? v : null;
    } catch {
      return null;
    }
  }
}
