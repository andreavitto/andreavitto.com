# Email automation

Internal tooling that classifies Gmail with Claude and forwards invoices to Xolo.

## Architecture

```
Gmail (andrea@minimo.it / info@andreavitto.com)
   │  thin Apps Script clients — Gmail I/O only, no logic
   ▼
/api/email/classify           ← the "brain": Claude Haiku + hard rules + notes/greylist
/api/email/invoice-forwarded  ← logs invoice + Telegram notify
/api/telegram/webhook         ← reply-to-alert feedback → saves notes/greylist
   │
   ├─ Supabase (email_* tables)   ← shared state across both accounts
   └─ Telegram (server is the ONLY caller → one webhook owner, no conflicts)
```

**Apps Script is a dumb client.** It reads unread mail, POSTs each message to
`/api/email/classify`, and applies the JSON response (`labels`, `archive`,
`markRead`) to Gmail. All intelligence lives in the Next.js server. Telegram is
never called from Apps Script — only from the server.

## Server (this repo)

Routes live in `src/app/api/email/*` and `src/app/api/telegram/webhook`; logic in
`src/lib/email/*`. Env vars: see `.env.example` (root). Deployed on Vercel with
the site.

### Supabase schema

`schema.sql` creates `email_sender_notes`, `email_greylist`, `email_classifications`,
`invoice_log` (all scoped to `EMAIL_AUTOMATION_USER_ID`, RLS-on so the anon key
can't read them). Apply with the linked project:

```sh
supabase link --project-ref <ref>
supabase db query --linked -f tools/email-automation/schema.sql
```

## Apps Script clients (deploy via clasp)

```sh
npm i -g @google/clasp
clasp login
```

For each account folder (`minimo/`, `andreavitto/`):

```sh
cd tools/email-automation/minimo
cp .clasp.json.example .clasp.json   # then paste the real scriptId (or `clasp create`)
clasp push
```

Set **Script Properties** on each project (Project Settings → Script Properties):

| Property | minimo | andreavitto |
|---|---|---|
| `API_BASE_URL` | `https://www.andreavitto.com` | `https://www.andreavitto.com` |
| `SHARED_SECRET` | = `APPS_SCRIPT_SHARED_SECRET` | same value |
| `ACCOUNT` | `minimo` | `andreavitto` |
| `XOLO_TARGET` | the Xolo ingest inbox | — (no forwarder) |

Then run once per project: `testClassifyEndpoint` (confirms reachable + authorized),
then the trigger installers:
- both projects: `installClassifierTrigger` (classifyInbox every 15 min)
- minimo only: `installForwardTrigger` (forwardInvoicesToXolo every 30 min — de-dups existing triggers, fixing the old duplicate)

## Telegram webhook (feedback)

The server owns the single webhook. Point Telegram at our endpoint and set the
secret token:

```sh
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://andreavitto.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

The bot must be a member of the notifications chat (`TELEGRAM_CHAT_ID`). Reply to
any 🚨 urgent alert with free text → the server saves it as a note for that
sender (write "non urgente" to also greylist them). Notes/greylist are shared
between both accounts because they live in one Supabase DB.

## Secrets — regenerate the ones exposed in chat

The bot token, Anthropic key, and the old key pasted during setup should be
rotated: bot token via @BotFather, Anthropic keys in the console (revoke the old
one). Nothing is hardcoded — all values come from env vars / Script Properties.
