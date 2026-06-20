import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSignedDownloadUrl, readFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const ev = await prisma.evidence.findUnique({
    where: { id },
    select: { storagePath: true, fileName: true, fileType: true },
  });
  if (!ev?.storagePath) return new Response("Minh chứng không có tệp đính kèm.", { status: 404 });

  // GCS: redirect to a short-lived signed URL (served straight from Cloud Storage).
  const signed = await getSignedDownloadUrl(ev.storagePath, ev.fileName ?? undefined);
  if (signed) return Response.redirect(signed, 302);

  // Local: stream the file through the app.
  try {
    const buf = await readFile(ev.storagePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": ev.fileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(ev.fileName || "evidence")}"`,
      },
    });
  } catch {
    return new Response("Không đọc được tệp minh chứng.", { status: 404 });
  }
}
