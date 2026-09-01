#!/usr/bin/env node
/**
 * Verifica l'isolamento RLS di `contact_requests` con la sola anon key.
 *
 *   node scripts/test-rls.mjs
 *
 * Atteso:
 *   - INSERT valido            → consentito
 *   - INSERT con privacy=false → rifiutato (policy + check constraint)
 *   - INSERT con status='sent' → rifiutato (la policy impone status='new')
 *   - SELECT                   → errore oppure zero righe, mai dati
 *   - UPDATE / DELETE          → nessuna riga toccata
 *   - SELECT sulla vista       → nessun dato (security_invoker)
 *
 * Esce con codice 1 se anche un solo controllo fallisce.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const file = join(ROOT, '.env');
  const env = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if (!/^["']/.test(v)) {
        const h = v.indexOf(' #');
        if (h !== -1) v = v.slice(0, h).trim();
      }
      env[t.slice(0, eq).trim()] = v.replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const url = env.PUBLIC_SUPABASE_URL;
const anon = env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon || anon === 'DA_SOSTITUIRE_IN_FASE_4') {
  console.error('✗ PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY non configurate in .env');
  console.error('  Avvia lo stack locale con `npm run sb:start` e copia i valori da `npm run sb:status`.');
  process.exit(1);
}

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const record = (name, passed, detail) => {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const newId = () => crypto.randomUUID();

const validRow = (overrides = {}) => ({
  id: newId(),
  section: 'commerciale',
  first_name: 'Test',
  last_name: 'RLS',
  email: `rls-${Date.now()}@example.com`,
  subject_type: 'Altro',
  message: 'Record generato dallo script di verifica RLS. Da ignorare e cancellare.',
  privacy_accepted: true,
  ...overrides,
});

console.log(`\nVerifica RLS su ${url}\n`);

// 1 — INSERT valido: deve passare.
// Niente .select(): chiederebbe return=representation, che senza policy di
// lettura fa fallire l'insert. L'id lo conosciamo perché lo generiamo noi.
let insertedId;
{
  const row = validRow();
  const { error } = await supabase.from('contact_requests').insert(row);
  insertedId = error ? null : row.id;
  record('anon PUÒ inserire una richiesta valida', !error, error?.message);
}

// 1b — l'insert NON deve poter restituire la riga appena scritta
{
  const { error } = await supabase
    .from('contact_requests')
    .insert(validRow())
    .select('id')
    .single();
  record('anon NON può rileggere la riga inserita (return=representation)', !!error,
    error ? 'rifiutato' : 'RIGA RESTITUITA');
}

// 2 — INSERT senza consenso privacy: deve fallire
{
  const { error } = await supabase
    .from('contact_requests')
    .insert(validRow({ privacy_accepted: false }));
  record('anon NON può inserire senza consenso privacy', !!error, error ? 'rifiutato' : 'ACCETTATO');
}

// 3 — INSERT che tenta di preimpostare lo stato: deve fallire
{
  const { error } = await supabase.from('contact_requests').insert(validRow({ status: 'sent' }));
  record("anon NON può forzare status='sent'", !!error, error ? 'rifiutato' : 'ACCETTATO');
}

// 4 — SELECT: nessun dato deve tornare
{
  const { data, error } = await supabase.from('contact_requests').select('id, email');
  const safe = !!error || !data || data.length === 0;
  record('anon NON può leggere contact_requests', safe, error ? 'errore RLS' : `righe: ${data?.length ?? 0}`);
}

// 5 — SELECT sulla vista di servizio
{
  const { data, error } = await supabase.from('contact_requests_overview').select('id, email');
  const safe = !!error || !data || data.length === 0;
  record('anon NON può leggere la vista overview', safe, error ? 'errore RLS' : `righe: ${data?.length ?? 0}`);
}

// 6 — UPDATE: nessuna riga deve essere modificata
{
  const { data, error } = await supabase
    .from('contact_requests')
    .update({ status: 'handled' })
    .not('id', 'is', null)
    .select('id');
  const safe = !!error || !data || data.length === 0;
  record('anon NON può aggiornare le richieste', safe, error ? 'errore RLS' : `righe: ${data?.length ?? 0}`);
}

// 7 — DELETE: nessuna riga deve essere cancellata
{
  const { data, error } = await supabase
    .from('contact_requests')
    .delete()
    .not('id', 'is', null)
    .select('id');
  const safe = !!error || !data || data.length === 0;
  record('anon NON può cancellare le richieste', safe, error ? 'errore RLS' : `righe: ${data?.length ?? 0}`);
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} controlli superati`);

if (insertedId) {
  console.log(`\nNota: il controllo 1 ha creato il record ${insertedId}.`);
  console.log('Rimuovilo con `npm run sb:reset` oppure da Supabase Studio.');
}

if (failed.length > 0) {
  console.error('\n✗ Isolamento RLS NON garantito. Non andare in produzione così.');
  process.exit(1);
}
console.log('\n✓ Isolamento RLS verificato.');
