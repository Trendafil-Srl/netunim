-- ---------------------------------------------------------------------------
-- Schema applicativo `netunim`.
--
-- Da qui in avanti ogni oggetto del progetto (tabelle, viste, funzioni, enum)
-- va creato qui dentro, non in `public`.
--
-- Perche' non `public`: e' lo schema di default di Postgres, condiviso con
-- estensioni e con qualunque cosa venga creata dal dashboard. Tenere il dominio
-- applicativo in uno schema proprio rende esplicito cosa appartiene al progetto,
-- permette di revocarne i privilegi in blocco e rende un `drop schema` la via
-- pulita per ricreare tutto da zero.
-- ---------------------------------------------------------------------------

create schema if not exists netunim;

comment on schema netunim is
  'Oggetti applicativi NETUNIM. Nulla di questo progetto va creato in public.';

-- ---------------------------------------------------------------------------
-- Privilegi
--
-- `usage` sullo schema e' il prerequisito: senza, i ruoli non vedono nemmeno
-- gli oggetti, e PostgREST risponde 404 invece di 401 — errore che manda fuori
-- strada perche' sembra un endpoint sbagliato.
-- ---------------------------------------------------------------------------

grant usage on schema netunim to anon, authenticated, service_role;

-- Nessuno puo' creare oggetti a mano nello schema: ci si passa dalle migration.
revoke create on schema netunim from public;

-- ---------------------------------------------------------------------------
-- Privilegi di default sugli oggetti futuri.
--
-- Solo per service_role, che e' il ruolo delle Edge Function e scavalca
-- comunque la RLS: risparmiare una grant per ogni tabella qui non allenta nulla.
--
-- Per `anon` e `authenticated` NON si impostano default privileges, di
-- proposito. Lo schema `public` di Supabase concede `all` ad anon su ogni
-- tabella nuova, lasciando che sia solo la RLS a difendere: una policy
-- dimenticata diventa cosi' una tabella leggibile da chiunque abbia la anon key.
-- Qui il default e' zero privilegi, e ogni migration dichiara esplicitamente
-- cosa concede. Costa una riga in piu' e toglie un'intera classe di errori.
-- ---------------------------------------------------------------------------

alter default privileges in schema netunim
  grant all on tables to service_role;

alter default privileges in schema netunim
  grant all on sequences to service_role;

alter default privileges in schema netunim
  grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- Promemoria per le migration successive
--
-- Ogni tabella nuova in questo schema richiede TRE cose, non una:
--
--   1. create table netunim.<nome> (...);
--   2. alter table netunim.<nome> enable row level security;
--   3. grant <verbi> on netunim.<nome> to <ruolo>;   -- + le policy
--
-- Il passo 3 e' quello che si dimentica: la policy da sola non basta, perche'
-- grant e RLS sono due filtri distinti e devono passare entrambi. Il sintomo e'
-- un 401 che sembra un problema di RLS e non lo e'.
--
-- Lo schema va anche esposto alla Data API: `schemas` in supabase/config.toml,
-- poi `npx supabase config push`. Senza, PostgREST non lo raggiunge affatto.
-- ---------------------------------------------------------------------------
