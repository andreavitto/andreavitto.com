-- ─────────────────────────────────────────────────────────────────────────
-- Email automation schema
-- Tables for the AI email classifier + Xolo invoice forwarder.
-- All rows are scoped to a user_id (FK auth.users) so they coexist with the
-- existing personal-assistant data in this shared DB without interfering.
--
-- Idempotent: safe to run multiple times.
-- Apply via: Supabase Studio → SQL Editor, or psql with the connection string.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Per-sender notes learned from Telegram replies.
--    sender_key is either a full email ("a@b.com") or a domain ("@b.com").
create table if not exists public.email_sender_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sender_key  text not null,
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists email_sender_notes_lookup
  on public.email_sender_notes (user_id, sender_key, created_at desc);

-- 2) Greylist: senders the user marked as "rarely urgent" (raises urgency bar).
create table if not exists public.email_greylist (
  user_id     uuid not null references auth.users(id) on delete cascade,
  sender_key  text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, sender_key)
);

-- 3) Classification log: one row per processed email (audit + recap).
create table if not exists public.email_classifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  account      text not null,                  -- 'minimo' | 'andreavitto'
  message_id   text,                           -- Gmail message id (dedupe/debug)
  sender_email text,
  subject      text,
  categoria    text not null,                  -- Primary | Fatture | Notifiche | Promo
  urgent       boolean not null default false,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists email_classifications_recap
  on public.email_classifications (user_id, created_at desc);

-- 4) Invoice forwarding log (replaces the Apps Script PropertiesService log).
create table if not exists public.invoice_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  supplier    text,
  subject     text,
  amount      text,            -- raw extracted amount string, e.g. "€12,00"
  amount_num  numeric,
  currency    text,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_log_recap
  on public.invoice_log (user_id, created_at desc);

-- ── Row Level Security ──
-- These tables are only ever touched by our server via the service-role key,
-- which bypasses RLS. We still enable RLS with no public policies so that the
-- anon/publishable key (used elsewhere in the app) can never read this data.
alter table public.email_sender_notes    enable row level security;
alter table public.email_greylist        enable row level security;
alter table public.email_classifications enable row level security;
alter table public.invoice_log           enable row level security;
