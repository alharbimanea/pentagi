import "server-only";
import { serverEnv } from "@/lib/env";

export type ScanResult = "clean" | "infected" | "not_scanned" | "error";

// Talks to a clamav-rest style service (POST multipart "file", JSON reply
// with an "infected" boolean or a "status" of OK/FOUND). Without
// CLAMAV_REST_URL files are recorded as not_scanned and flagged in the admin
// view; see docs/06-operations.md before launch.
export async function scanFile(bytes: Uint8Array, name: string): Promise<ScanResult> {
  const url = serverEnv().CLAMAV_REST_URL;
  if (!url) return "not_scanned";
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), name);
    const res = await fetch(url, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return "error";
    const json = (await res.json()) as { infected?: boolean; status?: string; Status?: string };
    const status = (json.status ?? json.Status ?? "").toUpperCase();
    if (json.infected === true || status === "FOUND") return "infected";
    if (json.infected === false || status === "OK") return "clean";
    return "error";
  } catch {
    return "error";
  }
}
