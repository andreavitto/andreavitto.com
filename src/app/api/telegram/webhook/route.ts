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

  // Only handle replies to one of our bot messages.
  if (!msg?.text || !reply?.text || !reply.from?.is_bot) {
    return NextResponse.json({ ok: true });
  }

  const feedback = msg.text.trim();
  const isRecap = reply.text.includes("Recap email");

  if (isRecap) {
    // Recap feedback: one or more "sender: note" lines.
    const results = await handleRecapFeedback(feedback);
    const summary = results.length
      ? results.map((r) => `✅ ${r}`).join("\n")
      : "Nessuna riga valida. Usa il formato: <code>mittente: nota</code>";
    await replyTo(msg.chat.id, msg.message_id, summary);
  } else {
    // Alert feedback: single sender extracted from the alert text.
    await handleAlertFeedback(msg.chat.id, msg.message_id, reply.text, feedback);
  }

  return NextResponse.json({ ok: true });
}

async function handleAlertFeedback(
  chatId: number,
  messageId: number,
  alertText: string,
  feedback: string,
): Promise<void> {
  const sender = extractEmail(alertText);
  if (!sender) {
    await replyTo(chatId, messageId, "Non riesco a capire il mittente dall'alert.");
    return;
  }
  await saveFeedback(sender, feedback);
  const extra = isNonUrgent(feedback) ? " (e messo sotto osservazione urgenza)" : "";
  await replyTo(chatId, messageId, `✅ Nota salvata per ${sender}${extra}.\n"${feedback}"`);
}

// Parse "sender: note" lines (sender may be a full email or a bare domain).
async function handleRecapFeedback(text: string): Promise<string[]> {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const note = line.slice(idx + 1).trim();
    if (!key || !note) continue;

    // Accept a full email, or a bare domain (stored as @domain).
    const email = extractEmail(key);
    const target = email || (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(key) ? "@" + key.toLowerCase() : "");
    if (!target) continue;

    await saveFeedback(target, note);
    out.push(`${target}: "${note}"${isNonUrgent(note) ? " (greylist)" : ""}`);
  }
  return out;
}

function isNonUrgent(s: string): boolean {
  const low = s.toLowerCase();
  return low.includes("non urgente") || low.includes("no urgente");
}

async function saveFeedback(sender: string, note: string): Promise<void> {
  await addSenderNote(sender, note);
  if (isNonUrgent(note)) await addToGreylist(sender);
}

export async function GET() {
  return NextResponse.json({ status: "Telegram email-feedback webhook active" });
}
