import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Bucket } from "@google-cloud/storage";

// Object storage abstraction. Evidence files live in object storage (Google Cloud
// Storage in production) while the DB keeps only metadata. Local filesystem is used
// for development. Switch with STORAGE_DRIVER=gcs (+ GCS_BUCKET, GCS_PROJECT_ID).

export interface StoredFile {
  storagePath: string;
  checksum: string;
  size: number;
}

function localBaseDir(): string {
  return path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
}

export function storageDriver(): string {
  return process.env.STORAGE_DRIVER || "local";
}

// Lazily-created, cached GCS bucket clients (only loaded when driver = gcs).
const bucketCache = new Map<string, Bucket>();
async function getBucket(name?: string): Promise<Bucket> {
  const bucketName = name || process.env.GCS_BUCKET;
  if (!bucketName) throw new Error("GCS_BUCKET chưa được cấu hình (cần khi STORAGE_DRIVER=gcs).");
  const cached = bucketCache.get(bucketName);
  if (cached) return cached;
  const { Storage } = await import("@google-cloud/storage");
  // On Cloud Run the service account is auto-detected (Application Default Credentials).
  const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID || undefined });
  const bucket = storage.bucket(bucketName);
  bucketCache.set(bucketName, bucket);
  return bucket;
}

function parseGs(storagePath: string): { bucket: string; name: string } {
  const m = storagePath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Đường dẫn GCS không hợp lệ: ${storagePath}`);
  return { bucket: m[1], name: m[2] };
}

/** Build the canonical evidence object path: evidence/{program}/{year}/{criterion}/{file} */
export function buildEvidencePath(opts: {
  programCode: string;
  year: number | string;
  criterionCode?: string | null;
  fileName: string;
}): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const parts = [
    "evidence",
    safe(opts.programCode),
    String(opts.year),
    opts.criterionCode ? safe(opts.criterionCode) : "_unsorted",
    `${Date.now()}_${safe(opts.fileName)}`,
  ];
  return parts.join("/");
}

export async function saveFile(relPath: string, data: Buffer, contentType?: string): Promise<StoredFile> {
  const checksum = crypto.createHash("sha256").update(data).digest("hex");

  if (storageDriver() === "gcs") {
    const bucket = await getBucket();
    await bucket.file(relPath).save(data, {
      resumable: false,
      contentType: contentType || undefined,
      metadata: { metadata: { checksum } },
    });
    return { storagePath: `gs://${bucket.name}/${relPath}`, checksum, size: data.length };
  }

  const full = path.join(localBaseDir(), relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return { storagePath: `local://${relPath}`, checksum, size: data.length };
}

export async function readFile(storagePath: string): Promise<Buffer> {
  if (storagePath.startsWith("local://")) {
    const rel = storagePath.replace("local://", "");
    return fs.readFile(path.join(localBaseDir(), rel));
  }
  if (storagePath.startsWith("gs://")) {
    const { bucket, name } = parseGs(storagePath);
    const b = await getBucket(bucket);
    const [contents] = await b.file(name).download();
    return contents;
  }
  throw new Error(`Unsupported storage path: ${storagePath}`);
}

/**
 * A direct, time-limited download URL for the object — a V4 signed URL for GCS so
 * large/confidential files are served straight from Cloud Storage (not proxied
 * through the app). Returns null for local storage (serve via an app route).
 */
export async function getSignedDownloadUrl(storagePath: string, fileName?: string): Promise<string | null> {
  if (storagePath.startsWith("gs://")) {
    const { bucket, name } = parseGs(storagePath);
    const b = await getBucket(bucket);
    const [url] = await b.file(name).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
      responseDisposition: fileName ? `attachment; filename="${encodeURIComponent(fileName)}"` : undefined,
    });
    return url;
  }
  return null;
}

/** Delete an object from storage (best-effort). */
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    if (storagePath.startsWith("local://")) {
      await fs.unlink(path.join(localBaseDir(), storagePath.replace("local://", "")));
    } else if (storagePath.startsWith("gs://")) {
      const { bucket, name } = parseGs(storagePath);
      const b = await getBucket(bucket);
      await b.file(name).delete({ ignoreNotFound: true });
    }
  } catch (err) {
    console.error("[storage] delete failed:", err);
  }
}
