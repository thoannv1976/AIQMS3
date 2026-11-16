import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { Badge, Button, Select } from "@/components/ui";
import { linkImprovementEvidenceAction, unlinkImprovementEvidenceAction } from "./actions";

interface EvLink {
  id: string;
  phase: "BEFORE" | "AFTER";
  evidence: { id: string; code: string; title: string };
}
interface EvOption {
  id: string;
  code: string;
  title: string;
}

function Column({ title, color, links, canWrite }: { title: string; color: "amber" | "green"; links: EvLink[]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {links.length === 0 ? (
        <p className="text-xs text-slate-400">Chưa có minh chứng.</p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <Link href={`/evidence/${l.evidence.id}`} className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-brand-700">
                <Badge color={color}>{l.evidence.code}</Badge>
                <span className="truncate">{l.evidence.title}</span>
              </Link>
              {canWrite && (
                <form action={unlinkImprovementEvidenceAction.bind(null, l.id)}>
                  <button type="submit" className="text-slate-300 hover:text-red-500" title="Gỡ">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ImprovementEvidenceBlock({
  improvementId,
  links,
  options,
  canWrite,
}: {
  improvementId: string;
  links: EvLink[];
  options: EvOption[];
  canWrite: boolean;
}) {
  const before = links.filter((l) => l.phase === "BEFORE");
  const after = links.filter((l) => l.phase === "AFTER");

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
        Minh chứng trước/sau cải tiến (PDCA) <ArrowRight className="h-3 w-3" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Column title="Trước cải tiến" color="amber" links={before} canWrite={canWrite} />
        <Column title="Sau cải tiến" color="green" links={after} canWrite={canWrite} />
      </div>

      {canWrite && options.length > 0 && (
        <form action={linkImprovementEvidenceAction.bind(null, improvementId)} className="mt-2 flex flex-wrap items-center gap-2">
          <Select name="evidenceId" className="h-8 w-auto max-w-xs text-xs" required defaultValue="">
            <option value="" disabled>
              Chọn minh chứng…
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.title}
              </option>
            ))}
          </Select>
          <Select name="phase" className="h-8 w-auto text-xs" defaultValue="AFTER">
            <option value="BEFORE">Trước cải tiến</option>
            <option value="AFTER">Sau cải tiến</option>
          </Select>
          <Button type="submit" size="sm" variant="outline">
            Gắn minh chứng
          </Button>
        </form>
      )}
    </div>
  );
}
