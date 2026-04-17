import pc from "picocolors";
import type { ILogger } from "../../core/ports/logger.port.js";

export class ConsoleLogger implements ILogger {
  constructor(private readonly verbose: boolean) {}

  debug(message: string): void {
    if (!this.verbose) return;
    process.stderr.write(`${pc.gray("[debug]")} ${message}\n`);
  }

  info(message: string): void {
    process.stderr.write(`${pc.cyan("[info]")} ${message}\n`);
  }

  warn(message: string): void {
    process.stderr.write(`${pc.yellow("[warn]")} ${message}\n`);
  }

  error(message: string): void {
    process.stderr.write(`${pc.red("[error]")} ${message}\n`);
  }
}
