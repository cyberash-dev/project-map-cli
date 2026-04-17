import type { IClock } from "../../core/ports/clock.port.js";

export class SystemClock implements IClock {
  nowIso(): string {
    return new Date().toISOString();
  }

  nowMs(): number {
    return Date.now();
  }
}
