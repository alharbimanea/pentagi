import { NextResponse } from "next/server";
import { processPaymentWebhook } from "@/lib/payments/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ result: "too_large" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ result: "too_large" }, { status: 413 });
  const outcome = await processPaymentWebhook(provider, raw, request.headers);
  return NextResponse.json({ result: outcome.result }, { status: outcome.status });
}
