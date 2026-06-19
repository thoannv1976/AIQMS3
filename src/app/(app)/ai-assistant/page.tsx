import { requireUser } from "@/lib/auth";
import { resolveProgram } from "@/lib/program-context";
import { ProgramSwitcher } from "@/components/program-switcher";
import { PageHeader, EmptyState } from "@/components/ui";
import { ChatBox } from "./ChatBox";

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const { programs, selected } = await resolveProgram(sp.program);

  return (
    <div>
      <PageHeader
        title="Trợ lý AI kiểm định"
        description="Hỏi đáp dựa trên kho minh chứng nội bộ (RAG). AI trả lời kèm trích dẫn minh chứng."
        actions={<ProgramSwitcher programs={programs} selectedId={selected?.id} />}
      />
      {selected ? (
        <ChatBox key={selected.id} programId={selected.id} />
      ) : (
        <EmptyState title="Chưa có chương trình" description="Hãy tạo chương trình và tải minh chứng trước." />
      )}
    </div>
  );
}
