"use server";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { scanFile } from "@/lib/files/scan";
import { checkUpload, contentMatches, MAX_UPLOAD_BYTES, mimeFor, safeFileName, storageKey, type FileKind, type UploadProblem } from "@/lib/files/validate";
import { TERMINAL_STATUSES, type OrderStatus } from "@/lib/orders/status";
import { rateLimit } from "@/lib/security/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const BUCKET = "order-files";

const requestSchema = z.object({
  orderId: z.string().uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  purpose: z.enum(["attachment", "message", "deliverable", "revision"]),
});

export type UploadTicket =
  | { ok: true; fileId: string; path: string; token: string }
  | { ok: false; problem: UploadProblem | "forbidden" | "rate_limited" | "failed" };

// Step one of an upload: authorize, register the file as pending and return
// a one-time signed upload token. The browser then sends the bytes straight
// to storage, so they never pass through a server action body limit.
export async function createUploadAction(input: z.input<typeof requestSchema>): Promise<UploadTicket> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problem: "failed" };
  const { orderId, name, size, purpose } = parsed.data;
  const viewer = await getViewer();
  if (!viewer) return { ok: false, problem: "forbidden" };
  if (!(await rateLimit("upload", viewer.user.id))) return { ok: false, problem: "rate_limited" };

  const supabase = await serverClient();
  const { data: order } = await supabase.from("orders").select("id, status, customer_id").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, problem: "forbidden" };
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (purpose === "deliverable" && !isAdmin) return { ok: false, problem: "forbidden" };
  if (!isAdmin && TERMINAL_STATUSES.includes(order.status as OrderStatus)) return { ok: false, problem: "forbidden" };

  const check = checkUpload(name, size);
  if ("problem" in check) return { ok: false, problem: check.problem };

  const fileId = randomUUID();
  const path = storageKey(orderId, fileId, check.kind);
  const db = adminClient();
  const { error } = await db.from("files").insert({
    id: fileId,
    order_id: orderId,
    uploader_id: viewer.user.id,
    kind: purpose,
    path,
    original_name: safeFileName(name),
    mime_type: mimeFor(check.kind),
    size_bytes: size,
    status: "pending_upload",
    scan_status: "pending",
  });
  if (error) return { ok: false, problem: "failed" };
  const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signError || !signed) return { ok: false, problem: "failed" };
  return { ok: true, fileId, path, token: signed.token };
}

export type FinalizeResult = { ok: true; scan: string } | { ok: false; problem: "forbidden" | "mismatch" | "too_large" | "infected" | "failed" };

// Step two: the server re-reads what actually landed in storage, checks it
// against the declared type, hashes and scans it, and only then marks it ready.
export async function finalizeUploadAction(fileId: string): Promise<FinalizeResult> {
  if (!z.string().uuid().safeParse(fileId).success) return { ok: false, problem: "failed" };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, problem: "forbidden" };
  const db = adminClient();
  const { data: file } = await db.from("files").select("*").eq("id", fileId).maybeSingle();
  if (!file || file.uploader_id !== viewer.user.id || file.status !== "pending_upload") return { ok: false, problem: "forbidden" };

  const reject = async (problem: "mismatch" | "too_large" | "infected" | "failed", scan = "error") => {
    await db.storage.from(BUCKET).remove([file.path]);
    await db.from("files").update({ status: "rejected", scan_status: scan }).eq("id", fileId);
    return { ok: false as const, problem };
  };

  const { data: blob, error } = await db.storage.from(BUCKET).download(file.path);
  if (error || !blob) return reject("failed");
  if (blob.size > MAX_UPLOAD_BYTES) return reject("too_large");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = (file.path.split(".").pop() === "jpg" ? "jpeg" : file.path.split(".").pop()) as FileKind;
  if (!contentMatches(kind, bytes)) return reject("mismatch");

  const scan = await scanFile(bytes, file.original_name);
  if (scan === "infected") return reject("infected", "infected");
  await db
    .from("files")
    .update({ status: "ready", scan_status: scan, size_bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
    .eq("id", fileId);
  return { ok: true, scan };
}
