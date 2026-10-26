export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const TYPES = {
  pdf: { mime: "application/pdf", ext: ["pdf"] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ["xlsx"] },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ["pptx"] },
  png: { mime: "image/png", ext: ["png"] },
  jpeg: { mime: "image/jpeg", ext: ["jpg", "jpeg"] },
  webp: { mime: "image/webp", ext: ["webp"] },
} as const;

export type FileKind = keyof typeof TYPES;

export const ACCEPT_ATTRIBUTE = Object.values(TYPES)
  .flatMap((t) => t.ext.map((e) => `.${e}`))
  .join(",");

export function kindForName(name: string): FileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  for (const [kind, t] of Object.entries(TYPES)) {
    if ((t.ext as readonly string[]).includes(ext)) return kind as FileKind;
  }
  return null;
}

export function mimeFor(kind: FileKind): string {
  return TYPES[kind].mime;
}

// The declared MIME type and extension come from the client; only the
// leading bytes say what the file really is. Office formats are ZIP
// containers, so a docx renamed to xlsx passes here and is caught by the
// malware scanner, not by this check.
export function sniff(bytes: Uint8Array): FileKind | "zip" | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (starts([0x50, 0x4b, 0x03, 0x04])) return "zip";
  return null;
}

export function contentMatches(kind: FileKind, bytes: Uint8Array): boolean {
  const actual = sniff(bytes);
  if (actual === "zip") return kind === "docx" || kind === "xlsx" || kind === "pptx";
  return actual === kind;
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = cleaned.length > 120 ? cleaned.slice(cleaned.length - 120) : cleaned;
  return trimmed.replace(/^\.+/, "") || "file";
}

export function storageKey(orderId: string, fileId: string, kind: FileKind): string {
  return `${orderId}/${fileId}.${TYPES[kind].ext[0]}`;
}

export type UploadProblem = "unsupported_type" | "too_large" | "empty";

export function checkUpload(name: string, size: number): { kind: FileKind } | { problem: UploadProblem } {
  const kind = kindForName(name);
  if (!kind) return { problem: "unsupported_type" };
  if (size <= 0) return { problem: "empty" };
  if (size > MAX_UPLOAD_BYTES) return { problem: "too_large" };
  return { kind };
}
