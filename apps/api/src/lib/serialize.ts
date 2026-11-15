/** Row as it goes on the wire: Date columns become ISO-8601 UTC strings. */
export type Wire<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export function wire<T extends object>(row: T): Wire<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as Wire<T>;
}
