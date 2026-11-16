import * as React from "react";

// Minimal, dependency-free Markdown renderer for AI output: headings, bold/italic,
// bullet & numbered lists, blockquotes, simple tables, horizontal rules.
function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${i++}`} className="rounded bg-slate-100 px-1 text-[0.85em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? "").replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl <= 1 ? "text-base font-bold" : lvl === 2 ? "text-[15px] font-semibold" : "text-sm font-semibold";
      blocks.push(<div key={k++} className={`${cls} mt-3 text-slate-900`}>{inline(h[2], `h${k}`)}</div>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t)) {
      blocks.push(<hr key={k++} className="my-3 border-slate-200" />);
      i++;
      continue;
    }
    if (t.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <div key={k++} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-slate-50 font-semibold" : ""}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-slate-200 px-2 py-1 align-top">
                      {inline(c, `t${k}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(t)) {
      const ordered = /^\d+[.)]/.test(t);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={k++} className={`my-1 ml-5 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, ii) => (
            <li key={ii}>{inline(it, `l${k}-${ii}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    if (t.startsWith(">")) {
      blocks.push(
        <blockquote key={k++} className="my-2 border-l-4 border-slate-200 pl-3 text-slate-600">
          {inline(t.replace(/^>\s?/, ""), `q${k}`)}
        </blockquote>,
      );
      i++;
      continue;
    }
    blocks.push(
      <p key={k++} className="my-1.5">
        {inline(t, `p${k}`)}
      </p>,
    );
    i++;
  }
  return <div className={`text-sm leading-relaxed text-slate-700 ${className ?? ""}`}>{blocks}</div>;
}
