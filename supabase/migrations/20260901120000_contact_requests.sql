-- ============================================================
-- NETUNIM · richieste di contatto dalla landing page
-- ============================================================

create extension if not exists "pgcrypto";

create type public.contact_section as enum ('commerciale', 'investigazione');
create type public.contact_status  as enum ('new', 'sent', 'failed', 'handled', 'spam');

create table public.contact_requests (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  section           public.contact_section not null,
  first_name        text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name         text not null check (char_length(trim(last_name))  between 1 and 80),
  email             text not null check (email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' and char_length(email) <= 160),
  phone             text          check (phone is null or char_length(phone) <= 40),
  company           text          check (company is null or char_length(company) <= 140),
  role              text          check (role is null or char_length(role) <= 100),
  subject_type      text not null check (char_length(subject_type) <= 120),
  message           text not null check (char_length(trim(message)) between 20 and 3000),
  privacy_accepted  boolean not null check (privacy_accepted = true),

  source_page       text          check (source_page is null or char_length(source_page) <= 300),
  utm               jsonb         not null default '{}'::jsonb,
  user_agent        text          check (user_agent is null or char_length(user_agent) <= 400),
  ip_hash           text          check (ip_hash is null or char_length(ip_hash) <= 64),

  status            public.contact_status not null default 'new',
  email_sent_at     timestamptz,
  email_error       text,
  notified_to       text
);

comment on table public.contact_requests is
  'Richieste di contatto dal sito netunim.com. Contiene dati personali: accesso solo via service_role.';

create index contact_requests_created_at_idx on public.contact_requests (created_at desc);
create index contact_requests_section_idx    on public.contact_requests (section, created_at desc);
create index contact_requests_status_idx     on public.contact_requests (status) where status <> 'sent';

-- ---------- RLS ----------
alter table public.contact_requests enable row level security;

-- il visitatore anonimo può SOLO inserire, mai leggere/aggiornare/cancellare
create policy "anon can insert contact requests"
  on public.contact_requests
  for insert
  to anon
  with check (
    privacy_accepted = true
    and status = 'new'
    and email_sent_at is null
    and email_error is null
  );

-- nessuna policy di select/update/delete per anon o authenticated:
-- la Edge Function opera con service_role, che bypassa RLS.

-- ---------- anti-abuso: max 3 richieste / 10 min dallo stesso ip_hash ----------
create or replace function public.enforce_contact_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  if new.ip_hash is null then
    return new;
  end if;

  select count(*) into recent_count
  from public.contact_requests
  where ip_hash = new.ip_hash
    and created_at > now() - interval '10 minutes';

  if recent_count >= 3 then
    raise exception 'rate_limit_exceeded'
      using errcode = 'P0001',
            hint = 'Troppe richieste dallo stesso dispositivo. Riprova tra qualche minuto.';
  end if;

  return new;
end;
$$;

create trigger contact_requests_rate_limit
  before insert on public.contact_requests
  for each row execute function public.enforce_contact_rate_limit();

-- ---------- vista di servizio per il backoffice futuro ----------
create or replace view public.contact_requests_overview
with (security_invoker = true) as
select id, created_at, section, subject_type, status,
       first_name || ' ' || last_name as full_name,
       email, phone, company, email_sent_at
from public.contact_requests
order by created_at desc;
