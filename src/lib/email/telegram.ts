// The ONLY module that talks to Telegram. Centralising it here means a single
// bot/webhook owner → no conflicts (the reason the old setup broke).

function config() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  return { botToken, chatId };
}

type TelegramPayload = Record<string, unknown>;

async function call(method: string, payload: TelegramPayload): Promise<void> {
  const { botToken } = config();
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[Telegram] ${method} failed:`, await res.text());
    }
  } catch (err) {
    console.error(`[Telegram] ${method} error:`, err);
  }
}

export async function sendMessage(text: string): Promise<void> {
  const { chatId } = config();
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

// Reply to a specific message (used to confirm a saved feedback note).
export async function replyTo(chatId: number | string, messageId: number, text: string): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    reply_to_message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

function truncate(s: string, n: number): string {
  return s && s.length > n ? s.slice(0, n) + "..." : s;
}

// Urgent email alert. The user can reply to teach the classifier (see webhook).
export async function notifyUrgent(params: {
  account: string;
  from: string;
  subject: string;
  categoria: string;
}): Promise<void> {
  const prefix = params.account === "minimo" ? "" : `[${params.account}] `;
  await sendMessage(
    `🚨 <b>${prefix}Email URGENTE</b> (${params.categoria})\n` +
      `Da: ${params.from}\n` +
      `Oggetto: ${truncate(params.subject || "", 140)}\n\n` +
      `↩️ Rispondi con una nota e la ricorderò per questo mittente.`,
  );
}
