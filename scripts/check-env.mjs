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
  if (!existsSync(ENV)) {
    console.error('✗ File .env mancante.');
    console.error('  Esegui: npm run env:init  e compila i valori richiesti.');
    process.exit(1);
  }

  const env = { ...parseDotenv(readFileSync(ENV, 'utf8')), ...process.env };
  const missing = REQUIRED.filter((k) => {
    const v = env[k];
    return v === undefined || PLACEHOLDERS.includes(v.trim());
  });

  if (missing.length > 0) {
    console.error('✗ Variabili d’ambiente mancanti o ancora ai valori di esempio:');
    for (const k of missing) console.error(`    ${k}`);
    console.error('');
    console.error('  Compila .env e riprova. I valori si trovano in Supabase:');
    console.error('  Project Settings → API → Project URL e anon public key.');
    process.exit(1);
  }

  console.log('✓ Ambiente valido');
}

if (process.argv.includes('--init')) init();
else check();
