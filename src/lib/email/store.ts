import { createAdminClient } from "@/lib/supabase/admin";

// Persistence layer for the email automation. All rows are scoped to the
// owner's user_id so they coexist with the shared DB's other data.

function userId(): string {
  const id = process.env.EMAIL_AUTOMATION_USER_ID;
  if (!id) throw new Error("Missing EMAIL_AUTOMATION_USER_ID");
  return id;
}

export interface SenderContext {
  notes: string[]; // free-text instructions the user gave for this sender/domain
  greylisted: boolean; // sender is "rarely urgent" → raise the urgency bar
}

// Load notes + greylist for a sender, matching both the full email and its domain.
export async function getSenderContext(senderEmail: string): Promise<SenderContext> {
  const email = senderEmail.toLowerCase();
  const domain = email.split("@")[1];
  const keys = domain ? [email, `@${domain}`] : [email];

  const supabase = createAdminClient();
  const [notesRes, greyRes] = await Promise.all([
    supabase
      .from("email_sender_notes")
      .select("note")
      .eq("user_id", userId())
      .in("sender_key", keys)
      .order("created_at", { ascending: true }),
    supabase
      .from("email_greylist")
      .select("sender_key")
      .eq("user_id", userId())
      .in("sender_key", keys)
      .limit(1),
  ]);

  return {
    notes: (notesRes.data ?? []).map((r) => r.note as string).slice(-8),
    greylisted: (greyRes.data ?? []).length > 0,
  };
}

// Save a note for both the sender email and its domain.
export async function addSenderNote(senderEmail: string, note: string): Promise<void> {
  const email = senderEmail.toLowerCase();
  const domain = email.split("@")[1];
  const keys = domain ? [email, `@${domain}`] : [email];

  const supabase = createAdminClient();
  await supabase.from("email_sender_notes").insert(
    keys.map((sender_key) => ({ user_id: userId(), sender_key, note })),
  );
}

// Add sender (and domain) to the greylist. Idempotent via upsert on PK.
export async function addToGreylist(senderEmail: string): Promise<void> {
  const email = senderEmail.toLowerCase();
  const domain = email.split("@")[1];
  const keys = domain ? [email, `@${domain}`] : [email];

  const supabase = createAdminClient();
  await supabase
    .from("email_greylist")
    .upsert(
      keys.map((sender_key) => ({ user_id: userId(), sender_key })),
      { onConflict: "user_id,sender_key", ignoreDuplicates: true },
    );
}

export interface ClassificationRecord {
  account: string;
  messageId?: string;
  senderEmail: string;
  subject: string;
  categoria: string;
  urgent: boolean;
  archived: boolean;
}

export async function logClassification(rec: ClassificationRecord): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("email_classifications").insert({
    user_id: userId(),
    account: rec.account,
    message_id: rec.messageId ?? null,
    sender_email: rec.senderEmail,
    subject: rec.subject,
    categoria: rec.categoria,
    urgent: rec.urgent,
    archived: rec.archived,
  });
}

export interface InvoiceRecord {
  supplier: string;
  subject: string;
  amount: string;
  amountNum: number;
  currency: string;
}

export async function logInvoice(rec: InvoiceRecord): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("invoice_log").insert({
    user_id: userId(),
    supplier: rec.supplier,
    subject: rec.subject,
    amount: rec.amount,
    amount_num: rec.amountNum || null,
    currency: rec.currency || null,
  });
}
