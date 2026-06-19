import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Object storage abstraction. The spec stores original evidence files in object
// storage (Google Cloud Storage in production) while the DB keeps only metadata.
// For local development we use the filesystem. Switch with STORAGE_DRIVER=gcs.

export interface StoredFile {
  storagePath: string;
  checksum: string;
  size: number;
}

function localBaseDir(): string {
  return path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
}

function driver(): string {
  return process.env.STORAGE_DRIVER || "local";
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

export async function saveFile(relPath: string, data: Buffer): Promise<StoredFile> {
  const checksum = crypto.createHash("sha256").update(data).digest("hex");

  if (driver() === "gcs") {
    // Production extension point. Requires @google-cloud/storage + GCS_BUCKET.
    throw new Error(
      "STORAGE_DRIVER=gcs is not wired up in this build. Use local storage for development " +
        "or implement the GCS upload here (see docs/09_DEPLOYMENT_GUIDE.md).",
    );
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
  throw new Error(`Unsupported storage path: ${storagePath}`);
}
