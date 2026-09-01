#!/usr/bin/env node
/**
 * check-env.mjs — valida .env prima di dev/build.
 *
 *   node scripts/check-env.mjs          verifica le variabili obbligatorie
 *   node scripts/check-env.mjs --init   crea .env da .env.example se manca
 *
 * Non stampa mai i valori: solo i nomi delle variabili mancanti.
 */

import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, '.env');
const ENV_EXAMPLE = join(ROOT, '.env.example');
const ENV_FUNCTIONS = join(ROOT, '.env.functions');
const ENV_FUNCTIONS_EXAMPLE = join(ROOT, '.env.functions.example');

const REQUIRED = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'];

/** Solo per scegliere il messaggio d'errore utile: il controllo e' identico. */
const isCI = Boolean(process.env.CI || process.env.NETLIFY || process.env.VERCEL);

/** Valori che indicano "non ancora compilato". */
const PLACEHOLDERS = [
  'https://xxxxxxxxxxxxxxxx.supabase.co',
  'eyJhbGciOi...',
  'xxxxxxxxxxxxxxxx',
  '',
];

/** Parser dotenv minimale: nessuna dipendenza. */
function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // rimuove un commento inline non quotato
    if (!/^["']/.test(value)) {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
      // Valore interamente commentato (`CHIAVE=   # nota`): vale stringa vuota.
      if (value.startsWith('#')) value = '';
    }
    // rimuove le virgolette esterne
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function init() {
  let created = false;

  if (!existsSync(ENV)) {
    if (!existsSync(ENV_EXAMPLE)) {
      console.error('✗ .env.example non trovato: impossibile inizializzare .env');
      process.exit(1);
    }
    copyFileSync(ENV_EXAMPLE, ENV);
    created = true;
    console.log('✓ Creato .env da .env.example');
  } else {
    console.log('· .env già presente, lasciato invariato');
  }

  if (!existsSync(ENV_FUNCTIONS) && existsSync(ENV_FUNCTIONS_EXAMPLE)) {
    copyFileSync(ENV_FUNCTIONS_EXAMPLE, ENV_FUNCTIONS);
    created = true;
    console.log('✓ Creato .env.functions da .env.functions.example');
  }

  if (created) {
    console.log('');
    console.log('  Valori da compilare prima di procedere:');
    console.log('   .env');
    console.log('     PUBLIC_SUPABASE_URL       URL del progetto Supabase');
    console.log('     PUBLIC_SUPABASE_ANON_KEY  anon key (pubblica, mai la service_role)');
    console.log('     PUBLIC_SITE_URL           dominio finale del sito');
    console.log('     SUPABASE_PROJECT_REF      ref del progetto, per la CLI');
    console.log('   .env.functions   secrets della Edge Function (SMTP/Graph, destinatari, salt)');
    console.log('');
  }
}

function check() {
  /**
   * Il file .env e' opzionale, non obbligatorio. In CI (Netlify, Vercel,
   * GitHub Actions) non esiste — e' in .gitignore — e le variabili arrivano
   * dall'ambiente del runner. Bloccare sull'assenza del file faceva fallire la
   * build anche con tutte le variabili correttamente impostate nel pannello.
   * Cio' che conta e' che i valori ci siano, non da dove arrivino.
   */
  const fromFile = existsSync(ENV) ? parseDotenv(readFileSync(ENV, 'utf8')) : {};
  const env = { ...fromFile, ...process.env };

  const missing = REQUIRED.filter((k) => {
    const v = env[k];
    return v === undefined || PLACEHOLDERS.includes(v.trim());
  });

  if (missing.length > 0) {
    console.error('✗ Variabili d’ambiente mancanti o ancora ai valori di esempio:');
    for (const k of missing) console.error(`    ${k}`);
    console.error('');
    if (isCI) {
      console.error('  Build in CI: impostale tra le variabili d’ambiente del servizio di hosting.');
      console.error('  Su Netlify: Site configuration → Environment variables.');
    } else {
      console.error('  Compila .env e riprova (`npm run env:init` lo crea da .env.example).');
    }
    console.error('  I valori si trovano in Supabase: Project Settings → API →');
    console.error('  Project URL e anon public key.');
    process.exit(1);
  }

  const origin = existsSync(ENV) ? '.env + ambiente' : 'solo ambiente (nessun .env: atteso in CI)';
  console.log(`✓ Ambiente valido — ${origin}`);
}

if (process.argv.includes('--init')) init();
else check();
