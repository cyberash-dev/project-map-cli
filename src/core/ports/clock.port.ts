export interface IClock {
  nowIso(): string;
  nowMs(): number;
}
