import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { recordInboundMessage } from "@/lib/integrations/inbound";
import { redeemLinkCode } from "@/lib/integrations/link-codes";
import { parseLinkCommand, sendTelegramMessage, telegramConfigured, type TelegramUpdate } from "@/lib/integrations/telegram";
import { safeEqual } from "@/lib/payments/hmac";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Telegram echoes the secret_token given to setWebhook in this header.
export async function POST(request: Request) {
  if (!telegramConfigured()) return new NextResponse(null, { status: 404 });
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(header, serverEnv().TELEGRAM_WEBHOOK_SECRET ?? "")) return new NextResponse(null, { status: 401 });

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  if (!message || message.chat.type !== "private") return NextResponse.json({ ok: true });
  const chatId = String(message.chat.id);
  const fromId = String(message.from?.id ?? message.chat.id);

  const code = parseLinkCommand(message.text);
  if (code) {
    if (!(await rateLimit("linkCode", `telegram:${fromId}`))) return NextResponse.json({ ok: true });
    const result = await redeemLinkCode("telegram", code, fromId, message.from?.username ? `@${message.from.username}` : (message.from?.first_name ?? null));
    await sendTelegramMessage(
      chatId,
      result === "linked"
        ? "✅ Your ResearchDesk Pro account is linked. · تم ربط حسابك."
        : "That code is invalid or expired. Create a new one in your account settings. · الرمز غير صالح أو منتهي.",
    );
    return NextResponse.json({ ok: true });
  }

  const stored = await recordInboundMessage({
    channel: "telegram",
    threadId: chatId,
    externalId: fromId,
    messageId: `${chatId}:${message.message_id}`,
    text: message.text ?? "(non-text message)",
    payload: update,
  });
  return NextResponse.json({ ok: stored !== "failed" }, { status: stored === "failed" ? 500 : 200 });
}
