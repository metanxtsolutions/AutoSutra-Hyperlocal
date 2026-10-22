import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "./env";
import { ValidationError } from "./errors";

/**
 * Creative asset storage. Files are never served from a public bucket URL:
 * they are streamed through /api/assets/[id] after an access check.
 */

export const UPLOAD_RULES = {
  image: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 8 * 1024 * 1024 },
  video: { types: ["video/mp4"], maxBytes: 25 * 1024 * 1024 },
} as const;

/** Detect the real file type from its first bytes; the browser-supplied type is not trusted. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  return null;
}

export function imageDimensions(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export interface ValidatedUpload {
  kind: "image" | "video";
  mime: string;
  bytes: Buffer;
  sha256: string;
  width: number | null;
  height: number | null;
  filename: string;
}

export async function validateUpload(file: File): Promise<ValidatedUpload> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) throw new ValidationError("Choose a file to upload");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  const kind = mime?.startsWith("image/") ? "image" : mime?.startsWith("video/") ? "video" : null;
  if (!mime || !kind) throw new ValidationError("Only JPEG, PNG or WebP images and MP4 videos are accepted");
  const rule = UPLOAD_RULES[kind];
  if (bytes.length > rule.maxBytes) throw new ValidationError(`${kind === "image" ? "Images" : "Videos"} must be under ${rule.maxBytes / 1024 / 1024} MB`);
  const dims = kind === "image" ? imageDimensions(bytes, mime) : null;
  if (dims && (dims.width < 600 || dims.height < 600)) throw new ValidationError("Images should be at least 600 × 600 pixels for ad placements");
  const filename = (file.name || "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return { kind, mime, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), width: dims?.width ?? null, height: dims?.height ?? null, filename };
}

let s3: S3Client | null = null;
function client(): S3Client {
  const env = getEnv();
  s3 ??= new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: !!env.STORAGE_ENDPOINT,
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
  });
  return s3;
}

function localPath(key: string): string {
  const root = path.resolve(getEnv().STORAGE_LOCAL_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    await client().send(new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

export async function getObject(key: string): Promise<Buffer> {
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    const res = await client().send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}
