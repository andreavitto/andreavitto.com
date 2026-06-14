import { type NextRequest, NextResponse } from "next/server";
import { getRecentClassifications, type RecentClassification } from "@/lib/email/store";
import { sendMessage } from "@/lib/email/telegram";

export const dynamic = "force-dynamic";

const RECAP_HOURS = 6;
const MAX_PER_CATEGORY = 12; // cap the preview list per category

// Auth: accept either the Apps Script shared secret OR Vercel Cron's header.
function authorized(req: NextRequest): boolean {
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const shared = process.env.APPS_SCRIPT_SHARED_SECRET;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (cronSecret && token === cronSecret) return true;
  if (shared && token.length === shared.length && token === shared) return true;
  return false;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const CAT_ORDER = ["Urgent", "Primary", "Fatture", "Notifiche", "Promo"] as const;
const CAT_EMOJI: Record<string, string> = {
  Urgent: "🚨",
  Primary: "✅",
  Fatture: "💰",
  Notifiche: "🔔",
  Promo: "📧",
};

function bucketOf(c: RecentClassification): string {
  return c.urgent ? "Urgent" : c.categoria;
}

function buildRecap(items: RecentClassification[]): string {
  const total = items.length;
  const archived = items.filter((i) => i.archived).length;

  const byCat: Record<string, RecentClassification[]> = {};
  for (const it of items) {
    const k = bucketOf(it);
    (byCat[k] ||= []).push(it);
  }

  let msg = `🧾 <b>Recap email (ultime ${RECAP_HOURS}h)</b>\n`;
  msg += `Classificate: ${total} · Archiviate: ${archived}\n`;

  for (const cat of CAT_ORDER) {
    const list = byCat[cat];
    if (!list || list.length === 0) continue;
    msg += `\n${CAT_EMOJI[cat]} <b>${cat}</b> (${list.length})\n`;
    list.slice(0, MAX_PER_CATEGORY).forEach((it) => {
      const sender = it.senderEmail || "?";
      const subj = truncate(it.subject || "(nessun oggetto)", 60);
      msg += `• <code>${esc(sender)}</code> — ${esc(subj)}\n`;
    });
    if (list.length > MAX_PER_CATEGORY) {
      msg += `  …e altre ${list.length - MAX_PER_CATEGORY}\n`;
    }
  }

  msg +=
    `\n<i>Per dare feedback, rispondi a questo messaggio con righe</i>\n` +
    `<code>mittente: nota</code>\n` +
    `<i>es.</i> <code>noon.com: sempre promo</code> · <code>capo@x.com: sempre urgente</code>`;

  return msg;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await getRecentClassifications(RECAP_HOURS);
  if (items.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "no classifications" });
  }
  await sendMessage(buildRecap(items));
  return NextResponse.json({ ok: true, sent: true, count: items.length });
}

// Vercel Cron triggers GET by default.
export async function GET(req: NextRequest) {
  return POST(req);
}
