import { getSignedDownloadUrl, readFile } from "../storage";

/** Send a stored evidence file: GCS → short-lived signed URL redirect; local → stream. */
export async function serveStoredFile(storagePath: string, fileName: string | null, fileType: string | null): Promise<Response> {
  const signed = await getSignedDownloadUrl(storagePath, fileName ?? undefined);
  if (signed) return Response.redirect(signed, 302);
  try {
    const buf = await readFile(storagePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": fileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName || "evidence")}"`,
      },
    });
  } catch {
    return new Response("Không đọc được tệp minh chứng.", { status: 404 });
  }
}
