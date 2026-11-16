import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canSeeEvidence } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { serveStoredFile } from "@/lib/evidence/serve";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const ev = await prisma.evidence.findUnique({
    where: { id },
    select: { id: true, code: true, programId: true, confidentiality: true, status: true, storagePath: true, fileName: true, fileType: true },
  });
  if (!ev?.storagePath) return new Response("Minh chứng không có tệp đính kèm.", { status: 404 });
  if (!(await canSeeEvidence(user, ev))) return new Response("Bạn không có quyền tải minh chứng này.", { status: 403 });

  await logAudit({ userId: user.id, action: "DOWNLOAD", entityType: "Evidence", entityId: ev.id, detail: { code: ev.code } });
  return serveStoredFile(ev.storagePath, ev.fileName, ev.fileType);
}
