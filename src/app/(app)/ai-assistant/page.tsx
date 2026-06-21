import Link from "next/link";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ChatBox, type Message } from "./ChatBox";
import { deleteChatSessionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AiAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; session?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);

  const sessions = selected
    ? await prisma.aiChatSession.findMany({
        where: { userId: user.id, programId: selected.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true, createdAt: true },
      })
    : [];

  const activeId = sp.session;
  let initialMessages: Message[] = [];
  if (activeId && selected) {
    const session = await prisma.aiChatSession.findFirst({
      where: { id: activeId, userId: user.id, programId: selected.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (session) {
      initialMessages = session.messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        text: m.content,
        citations: (m.citations as unknown as Message["citations"]) ?? undefined,
      }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Trợ lý AI kiểm định"
        description="Hỏi đáp dựa trên kho minh chứng nội bộ (RAG). AI trả lời kèm trích dẫn minh chứng."
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />
      {selected ? (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3">
            <Link
              href={`/ai-assistant?program=${selected.id}`}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Phiên mới
            </Link>
            <div className="mt-3 space-y-0.5">
              {sessions.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-slate-400">Chưa có phiên hỏi đáp nào.</p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${s.id === activeId ? "bg-brand-50" : "hover:bg-slate-50"}`}
                  >
                    <Link href={`/ai-assistant?program=${selected.id}&session=${s.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm text-slate-700">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{s.title}</span>
                      </div>
                      <div className="pl-5 text-[11px] text-slate-400">{formatDate(s.createdAt)}</div>
                    </Link>
                    <form action={deleteChatSessionAction.bind(null, s.id)}>
                      <button
                        type="submit"
                        className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                        title="Xóa phiên"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                ))
              )}
            </div>
          </aside>

          <ChatBox
            key={activeId ?? selected.id}
            programId={selected.id}
            initialMessages={initialMessages}
            initialSessionId={activeId}
          />
        </div>
      ) : (
        <EmptyState title="Chưa có chương trình" description="Hãy tạo chương trình và tải minh chứng trước." />
      )}
    </div>
  );
}
