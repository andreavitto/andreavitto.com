import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/email/auth";
import { logInvoice } from "@/lib/email/store";
import { sendMessage } from "@/lib/email/telegram";

export const dynamic = "force-dynamic";

interface InvoiceRequest {
  supplier?: string;
  subject?: string;
  amount?: string;
  amountNum?: number;
  currency?: string;
}

function truncate(s: string, n: number): string {
  return s && s.length > n ? s.slice(0, n) + "..." : s;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: InvoiceRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supplier = body.supplier || "Unknown";
  const subject = body.subject || "";
  const amount = body.amount || "";

  await logInvoice({
    supplier,
    subject,
    amount,
    amountNum: body.amountNum || 0,
    currency: body.currency || "",
  });

  await sendMessage(
    `🧾 <b>Fattura inoltrata a Xolo</b>\n` +
      `Fornitore: ${supplier}\n` +
      (amount ? `Importo: ${amount}\n` : "") +
      `Oggetto: ${truncate(subject, 120)}`,
  );

  return NextResponse.json({ ok: true });
}
