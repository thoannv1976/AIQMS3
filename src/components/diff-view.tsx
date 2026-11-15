import type { DiffPart } from "@/lib/diff";
import { diffStats } from "@/lib/diff";

/** Render a sentence-level diff: removed text struck through in red, added text in green. */
export function DiffView({ parts }: { parts: DiffPart[] }) {
  if (!diffStats(parts).changed) {
    return parts.length ? <p className="text-sm text-slate-600">{parts.map((p) => p.text).join(" ")}</p> : <p className="text-xs text-slate-400">(trống)</p>;
  }
  return (
    <div className="text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i} className="text-slate-600">
            {p.text}{" "}
          </span>
        ) : p.type === "add" ? (
          <span key={i} className="rounded bg-green-100 text-green-900">
            {p.text}{" "}
          </span>
        ) : (
          <span key={i} className="rounded bg-red-100 text-red-800 line-through">
            {p.text}{" "}
          </span>
        ),
      )}
    </div>
  );
}
