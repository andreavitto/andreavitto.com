import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/email/auth";
import { classifyEmail, extractEmail, type Categoria } from "@/lib/email/classifier";
import { getSenderContext, logClassification } from "@/lib/email/store";
import { notifyUrgent } from "@/lib/email/telegram";

export const dynamic = "force-dynamic";

// Gmail label names the thin Apps Script client applies based on the response.
const LABELS: Record<Categoria, string> = {
  Primary: "✅ Primary",
  Fatture: "💰 Fatture/Ricevute",
  Notifiche: "🔔 Notifiche Sistema",
  Promo: "📧 Promozionali",
};
const URGENT_LABEL = "🚨 Urgent";

interface ClassifyRequest {
  account?: string;
  from?: string;
  subject?: string;
  bodySnippet?: string;
  messageId?: string;
  bulk?: boolean; // when true: classify + persist, but suppress Telegram push
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ClassifyRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const account = body.account || "minimo";
  const from = body.from || "";
  const subject = body.subject || "";
  const bodySnippet = (body.bodySnippet || "").slice(0, 600);
  const senderEmail = extractEmail(from);

  const ctx = await getSenderContext(senderEmail);
  const result = await classifyEmail({ from, subject, bodySnippet }, ctx);

  // Decide Gmail actions: only Primary and Urgent stay in inbox; the rest is archived.
  const labels = [LABELS[result.categoria]];
  if (result.urgent) labels.push(URGENT_LABEL);
  const archive = !result.urgent && result.categoria !== "Primary";

  // Persist + notify (server is the only thing that talks to Telegram).
  await logClassification({
    account,
    messageId: body.messageId,
    senderEmail,
    subject,
    categoria: result.categoria,
    urgent: result.urgent,
    archived: archive,
  });

  if (result.urgent && !body.bulk) {
    await notifyUrgent({ account, from, subject, categoria: result.categoria });
  }

  return NextResponse.json({
    categoria: result.categoria,
    urgent: result.urgent,
    labels,
    archive,
    markRead: archive, // archived mail is also marked read
  });
}
