// Small dependency-free diff (LCS over sentence/line segments, then over words for
// short changed segments). Used to compare SAR section revisions and report versions.
export type DiffPart = { type: "same" | "add" | "del"; text: string };

function segments(text: string): string[] {
  return (text ?? "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?…:;])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function lcs<T>(a: T[], b: T[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  // Guard against pathological sizes: fall back to a plain replace.
  if (n * m > 4_000_000) {
    return [
      ...a.map((x) => ({ type: "del" as const, text: String(x) })),
      ...b.map((x) => ({ type: "add" as const, text: String(x) })),
    ];
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: String(a[i]) });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: String(a[i++]) });
    } else {
      out.push({ type: "add", text: String(b[j++]) });
    }
  }
  while (i < n) out.push({ type: "del", text: String(a[i++]) });
  while (j < m) out.push({ type: "add", text: String(b[j++]) });
  return out;
}

/** Diff two texts by sentence; returns parts in reading order. */
export function diffText(oldText: string | null | undefined, newText: string | null | undefined): DiffPart[] {
  return lcs(segments(oldText ?? ""), segments(newText ?? ""));
}

export function diffStats(parts: DiffPart[]): { added: number; removed: number; changed: boolean } {
  const added = parts.filter((p) => p.type === "add").length;
  const removed = parts.filter((p) => p.type === "del").length;
  return { added, removed, changed: added + removed > 0 };
}
