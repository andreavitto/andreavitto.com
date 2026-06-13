import type { SenderContext } from "./store";

// Email classifier — ported from the Apps Script classifyOne_/hardRules_.
// Decides category + urgency for a single email using Claude Haiku, then
// applies deterministic hard rules that always win over the model.

export type Categoria = "Primary" | "Fatture" | "Notifiche" | "Promo";

export interface ClassifyInput {
  from: string;
  subject: string;
  bodySnippet: string;
}

export interface ClassifyResult {
  categoria: Categoria;
  urgent: boolean;
}

const MODEL = "claude-haiku-4-5";

export function extractEmail(from: string): string {
  const m = (from || "").match(/[\w.+-]+@[\w.-]+/);
  return m ? m[0] : "";
}

// Deterministic overrides — these always win over the model's guess.
export function applyHardRules(
  res: ClassifyResult,
  from: string,
  subject: string,
  body: string,
): ClassifyResult {
  const s = (subject || "").toLowerCase();
  const f = (from || "").toLowerCase();
  const b = (body || "").toLowerCase();
  const txt = `${s} ${b}`;

  const transactional =
    /magic link|reset.*password|password.*reset|verification code|verify your|one-?time|otp|codice di verifica|conferma.*email|confirm your email|sign in to|log ?in to|accedi a|your code is|security code/i;

  if (transactional.test(txt)) {
    return { categoria: "Notifiche", urgent: false };
  }
  let urgent = res.urgent;
  if (/no-?reply@|notifications?@|mailer@|automated@|do-?not-?reply/i.test(f)) urgent = false;
  if (res.categoria === "Promo") urgent = false;
  return { categoria: res.categoria, urgent };
}

function buildPrompt(input: ClassifyInput, ctx: SenderContext): string {
  const greyNote = ctx.greylisted
    ? "NOTA: mittente raramente urgente per l'utente. urgent=true solo se certo.\n"
    : "";
  const notesBlock = ctx.notes.length
    ? "ISTRUZIONI dell'utente per questo mittente (RISPETTALE):\n- " +
      ctx.notes.join("\n- ") +
      "\n"
    : "";

  return (
    "Classifica questa email.\n\n" +
    "CATEGORIA (una): Primary | Fatture | Notifiche | Promo.\n" +
    "URGENT true/false: MOLTO restrittivo, raro. true SOLO se: scadenza esplicita imminente, " +
    "richiesta personale diretta che attende risposta, o problema critico in corso. " +
    "urgent SEMPRE false per: notifiche automatiche, noreply, security, CI/CD, login, newsletter, promo, digest.\n" +
    greyNote +
    notesBlock +
    'Rispondi SOLO JSON: {"categoria":"Primary|Fatture|Notifiche|Promo","urgent":true|false}\n\n' +
    `Da: ${input.from}\nOggetto: ${input.subject}\nCorpo: ${input.bodySnippet}`
  );
}

export async function classifyEmail(
  input: ClassifyInput,
  ctx: SenderContext,
): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let result: ClassifyResult = { categoria: "Notifiche", urgent: false };

  if (!apiKey) {
    console.error("[Classifier] Missing ANTHROPIC_API_KEY — defaulting to Notifiche");
    return applyHardRules(result, input.from, input.subject, input.bodySnippet);
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 60,
        messages: [{ role: "user", content: buildPrompt(input, ctx) }],
      }),
    });

    const data = await resp.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      const valid: Categoria[] = ["Primary", "Fatture", "Notifiche", "Promo"];
      if (valid.includes(obj.categoria)) {
        result = { categoria: obj.categoria, urgent: obj.urgent === true };
      }
    }
  } catch (err) {
    console.error("[Classifier] Error:", err);
  }

  return applyHardRules(result, input.from, input.subject, input.bodySnippet);
}
