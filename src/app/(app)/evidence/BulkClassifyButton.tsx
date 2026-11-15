"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { bulkAiClassifyAction } from "./actions";

/** "AI phân loại": suggest + attach the best criterion for evidence that has none (flagged AI). */
export function BulkClassifyButton({ programId, count }: { programId: string; count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-purple-200 bg-purple-50/60 px-4 py-2.5 text-sm">
      <Sparkles className="h-4 w-4 text-purple-600" />
      <span className="text-slate-700">
        Có <b>{count}</b> minh chứng chưa gắn tiêu chí. AI có thể đọc nội dung và gắn tiêu chí phù hợp nhất (gắn nhãn “AI”, người phụ trách kiểm tra lại).
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await bulkAiClassifyAction(programId);
            setMsg(`Đã phân loại ${r.processed} minh chứng, gắn tiêu chí cho ${r.linked}.`);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI phân loại
      </Button>
      {msg && <span className="text-green-700">{msg}</span>}
    </div>
  );
}
