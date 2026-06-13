import { type NextRequest, NextResponse } from "next/server";
import { extractEmail } from "@/lib/email/classifier";
import { addSenderNote, addToGreylist } from "@/lib/email/store";
import { replyTo } from "@/lib/email/telegram";

export const dynamic = "force-dynamic";

// Telegram authenticates webhook calls with a secret token header that we set
// via setWebhook(secret_token=...). See tools/email-automation/README.md.
function isFromTelegram(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[Telegram] TELEGRAM_WEBHOOK_SECRET not set — rejecting");
    return false;
  }
  return req.headers.get("x-telegram-bot-api-secret-token") === expected;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    message_id: number;
    reply_to_message?: {
      text?: string;
      from?: { is_bot?: boolean };
    };
  };
}

export async function POST(req: NextRequest) {
  if (!isFromTelegram(req)) {
    return NextResponse.json({ ok: true }); // ignore silently
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const reply = msg?.reply_to_message;

  // Only handle replies to one of our bot alerts.
  if (msg?.text && reply?.text && reply.from?.is_bot) {
    const feedback = msg.text.trim();
    const sender = extractEmail(reply.text);

    if (!sender) {
      await replyTo(msg.chat.id, msg.message_id, "Non riesco a capire il mittente dall'alert.");
      return NextResponse.json({ ok: true });
    }

    await addSenderNote(sender, feedback);

    let extra = "";
    const low = feedback.toLowerCase();
    if (low.includes("non urgente") || low.includes("no urgente")) {
      await addToGreylist(sender);
      extra = " (e messo sotto osservazione urgenza)";
    }

    await replyTo(
      msg.chat.id,
      msg.message_id,
      `✅ Nota salvata per ${sender}${extra}.\n"${feedback}"`,
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "Telegram email-feedback webhook active" });
}
