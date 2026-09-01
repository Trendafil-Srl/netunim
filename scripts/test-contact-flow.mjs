#!/usr/bin/env node
/**
 * Smoke test end-to-end del flusso di contatto, su ambiente locale.
 *
 *   node scripts/test-contact-flow.mjs
 *   node scripts/test-contact-flow.mjs --section investigazione
 *   node scripts/test-contact-flow.mjs --keep     non cancella il record
 *
 * Passi:
 *   1. inserisce un record di prova con la anon key (come farebbe il browser)
 *   2. invoca send-contact-request
 *   3. rilegge lo stato con la service_role e verifica status='sent'
 *
 * Serve a validare le credenziali SMTP/Graph senza aprire il browser.
 * Richiede SUPABASE_SERVICE_ROLE_KEY nell'ambiente o in .env per il passo 3
 * (la anon key non può leggere: è esattamente ciò che verifica test-rls.mjs).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseDotenv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let v = line.slice(eq + 1).trim();
    if (!/^["']/.test(v)) {
      const h = v.indexOf(' #');
      if (h !== -1) v = v.slice(0, h).trim();
    }
    out[line.slice(0, eq).trim()] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = {
  ...parseDotenv(join(ROOT, '.env')),
  ...parseDotenv(join(ROOT, '.env.functions')),
  ...process.env,
};

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const sectionArg = args.indexOf('--section');
const section = sectionArg !== -1 ? args[sectionArg + 1] : 'commerciale';

if (!['commerciale', 'investigazione'].includes(section)) {
  console.error(`✗ --section non valido: ${section}. Ammessi: commerciale | investigazione.`);
  process.exit(1);
}

const url = env.PUBLIC_SUPABASE_URL;
const anon = env.PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || anon === 'DA_SOSTITUIRE_IN_FASE_4') {
  console.error('✗ PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY non configurate.');
  console.error('  Avvia lo stack con `npm run sb:start` e copia i valori da `npm run sb:status`.');
  process.exit(1);
}

const anonClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const step = (n, text) => console.log(`\n[${n}] ${text}`);

console.log(`\nSmoke test del flusso di contatto — area: ${section}`);
console.log(`Endpoint: ${url}`);

/* 1 — insert come farebbe il browser -------------------------------- */
step(1, 'Inserimento del record con la anon key…');

const row = {
  section,
  first_name: 'Smoke',
  last_name: 'Test',
  email: env.SMOKE_TEST_EMAIL ?? 'smoke-test@example.com',
  phone: null,
  company: 'NETUNIM — test automatico',
  role: null,
  subject_type: 'Altro',
  message:
    'Messaggio generato da scripts/test-contact-flow.mjs per verificare il flusso di invio. Da ignorare.',
  privacy_accepted: true,
  source_page: '/scripts/test-contact-flow',
  utm: {},
  user_agent: 'netunim-smoke-test',
};

const { data: inserted, error: insertError } = await anonClient
  .from('contact_requests')
  .insert(row)
  .select('id')
  .single();

if (insertError) {
  console.error(`✗ Insert fallito: ${insertError.message}`);
  process.exit(1);
}
const id = inserted.id;
console.log(`    ✓ record creato: ${id}`);

/* 2 — invocazione della Edge Function -------------------------------- */
step(2, 'Invocazione di send-contact-request…');

const { data: fnData, error: fnError } = await anonClient.functions.invoke('send-contact-request', {
  body: { id },
});

if (fnError) {
  console.error(`✗ Invocazione fallita: ${fnError.message}`);
  console.error('  Con lo stack locale la function deve girare: `npm run fn:serve`.');
  console.error(`  Il record ${id} resta in tabella per l'ispezione.`);
  process.exit(1);
}
console.log(`    ✓ risposta: ${JSON.stringify(fnData)}`);

/* 3 — verifica dello stato ------------------------------------------ */
step(3, 'Verifica dello stato del record…');

if (!serviceRole) {
  console.log('    · SUPABASE_SERVICE_ROLE_KEY assente: verifica dello stato saltata.');
  console.log('      La anon key non può leggere la tabella (RLS): è il comportamento atteso.');
  console.log(`      Controlla a mano su Supabase Studio il record ${id}.`);
  process.exit(0);
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: record, error: readError } = await admin
  .from('contact_requests')
  .select('status, email_sent_at, notified_to, email_error')
  .eq('id', id)
  .single();

if (readError) {
  console.error(`✗ Rilettura fallita: ${readError.message}`);
  process.exit(1);
}

console.log(`    status       : ${record.status}`);
console.log(`    email_sent_at: ${record.email_sent_at ?? '—'}`);
console.log(`    notified_to  : ${record.notified_to ?? '—'}`);
if (record.email_error) console.log(`    email_error  : ${record.email_error}`);

/* 4 — idempotenza ---------------------------------------------------- */
if (record.status === 'sent') {
  step(4, 'Verifica di idempotenza (seconda invocazione)…');
  const { data: again } = await anonClient.functions.invoke('send-contact-request', {
    body: { id },
  });
  const idempotent = again?.alreadySent === true;
  console.log(`    ${idempotent ? '✓' : '✗'} seconda invocazione: ${JSON.stringify(again)}`);
  if (!idempotent) {
    console.error('\n✗ La function ha rispedito la mail: idempotenza non rispettata.');
    process.exit(1);
  }
}

if (!keep) {
  await admin.from('contact_requests').delete().eq('id', id);
  console.log(`\n· record di prova ${id} rimosso (usa --keep per conservarlo)`);
}

if (record.status !== 'sent') {
  console.error(`\n✗ Stato atteso 'sent', trovato '${record.status}'.`);
  if (record.email_error) console.error(`  Causa: ${record.email_error}`);
  process.exit(1);
}

console.log('\n✓ Flusso completo verificato: insert → invio → stato aggiornato.');
