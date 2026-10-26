import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { recordInboundMessage } from "@/lib/integrations/inbound";
import { extractWhatsAppMessages, whatsappConfigured, type WhatsAppWebhook } from "@/lib/integrations/whatsapp";
import { safeEqual, verifyHmacSha256 } from "@/lib/payments/hmac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Meta's subscription handshake.
export async function GET(request: NextRequest) {
  if (!whatsappConfigured()) return new NextResponse(null, { status: 404 });
  const sp = request.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && safeEqual(sp.get("hub.verify_token") ?? "", serverEnv().WHATSAPP_VERIFY_TOKEN ?? "")) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse(null, { status: 403 });
}

// Messages are filed into the inbox under the sender's verified identity
// only; a phone number alone never links to a customer or reveals an order.
export async function POST(request: Request) {
  if (!whatsappConfigured()) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  if (!verifyHmacSha256(serverEnv().WHATSAPP_APP_SECRET ?? "", raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse(null, { status: 401 });
  }
  let body: WhatsAppWebhook;
  try {
    body = JSON.parse(raw) as WhatsAppWebhook;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  let failed = false;
  for (const m of extractWhatsAppMessages(body)) {
    const result = await recordInboundMessage({ channel: "whatsapp", threadId: m.from, externalId: m.from, messageId: m.id, text: m.text, payload: m });
    failed ||= result === "failed";
  }
  return new NextResponse(null, { status: failed ? 500 : 200 });
}
