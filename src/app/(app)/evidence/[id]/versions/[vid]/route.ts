import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canSeeEvidence } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { serveStoredFile } from "@/lib/evidence/serve";

/** Download an earlier file version of an evidence item. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) {
  const user = await requireUser();
  const { id, vid } = await params;
  const fv = await prisma.evidenceFileVersion.findFirst({
    where: { id: vid, evidenceId: id },
    include: { evidence: { select: { id: true, code: true, programId: true, confidentiality: true, status: true } } },
  });
  if (!fv?.storagePath) return new Response("Không tìm thấy phiên bản.", { status: 404 });
  if (!(await canSeeEvidence(user, fv.evidence))) return new Response("Bạn không có quyền tải tệp này.", { status: 403 });
  await logAudit({ userId: user.id, action: "DOWNLOAD", entityType: "Evidence", entityId: id, detail: { version: fv.version } });
  return serveStoredFile(fv.storagePath, fv.fileName, fv.fileType);
}
