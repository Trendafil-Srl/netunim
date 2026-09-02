#!/usr/bin/env node
/**
 * Push dei secrets della Edge Function da .env.functions a Supabase.
 *
 *   node scripts/supabase-secrets.mjs
 *   node scripts/supabase-secrets.mjs --file .env.functions.staging
 *   node scripts/supabase-secrets.mjs --dry-run
 *
 * Node >= 20, zero dipendenze.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Allow-list: solo queste chiavi vengono spedite. Una SUPABASE_SERVICE_ROLE_KEY
 * finita per sbaglio nel file non parte mai (peraltro Supabase la inietta
 * d'ufficio nel runtime della function).
 */
const ALLOWED = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'SMTP_FROM_NAME',
  'MAIL_TRANSPORT',
  'GRAPH_TENANT_ID',
  'GRAPH_CLIENT_ID',
  'GRAPH_CLIENT_SECRET',
  'GRAPH_SENDER_UPN',
  'GRAPH_SAVE_TO_SENT_ITEMS',
  'CONTACT_EMAIL_COMMERCIALE',
  'CONTACT_EMAIL_INVESTIGAZIONE',
  'CONFIRMATION_ENABLED',
  'IP_HASH_SALT',
  // In ingresso si accettano entrambi i nomi; in uscita si pubblica SITE_URL,
  // che e' quello che la Edge Function legge davvero (vedi normalizzazione).
  'SITE_URL',
  'PUBLIC_SITE_URL',
];

/** Obbligatori sempre. */
const REQUIRED_ALWAYS = [
  'MAIL_TRANSPORT',
  'CONTACT_EMAIL_COMMERCIALE',
  'CONTACT_EMAIL_INVESTIGAZIONE',
  'SITE_URL',
  'IP_HASH_SALT',
];

/** Obbligatori in funzione del trasporto scelto. */
const REQUIRED_BY_TRANSPORT = {
  smtp: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'],
  graph: ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'GRAPH_SENDER_UPN'],
};

/** Parser dotenv minimale. */
function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // commento inline solo se il valore non è quotato
    if (!/^["']/.test(value)) {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
      // Valore interamente commentato (`CHIAVE=   # nota`): vale stringa vuota,
      // altrimenti il testo della nota finirebbe pubblicato come secret.
      if (value.startsWith('#')) value = '';
    }
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

/** SMTP_PASSWORD=ab••••••yz */
function mask(value) {
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${value.slice(0, 2)}${'•'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.indexOf('--file');
const envFile = join(ROOT, fileArg !== -1 ? (args[fileArg + 1] ?? '.env.functions') : '.env.functions');

if (!existsSync(envFile)) {
  console.error(`✗ File non trovato: ${envFile}`);
  console.error('  Copia .env.functions.example in .env.functions e compila i valori.');
  process.exit(1);
}

const parsed = parseDotenv(readFileSync(envFile, 'utf8'));

// Solo le chiavi in allow-list, e solo se valorizzate.
const secrets = {};
const skipped = [];
for (const [key, value] of Object.entries(parsed)) {
  if (!ALLOWED.includes(key)) {
    skipped.push(key);
    continue;
  }
  if (value !== '') secrets[key] = value;
}

/**
 * La Edge Function legge `SITE_URL`. In .env.functions si tollera anche
 * `PUBLIC_SITE_URL` (stesso nome usato dal frontend in .env), ma il secret
 * viene comunque pubblicato come SITE_URL: con il nome sbagliato la function
 * non lo troverebbe e il CORS ricadrebbe sul dominio di default.
 */
if (!secrets.SITE_URL && secrets.PUBLIC_SITE_URL) {
  secrets.SITE_URL = secrets.PUBLIC_SITE_URL;
  console.log('· PUBLIC_SITE_URL pubblicata come SITE_URL (nome letto dalla function)');
}
delete secrets.PUBLIC_SITE_URL;

const transport = (secrets.MAIL_TRANSPORT ?? 'smtp').toLowerCase();
if (!['smtp', 'graph'].includes(transport)) {
  console.error(`✗ MAIL_TRANSPORT non valido: "${transport}". Ammessi: smtp | graph.`);
  process.exit(1);
}

const required = [...REQUIRED_ALWAYS, ...(REQUIRED_BY_TRANSPORT[transport] ?? [])];
const missing = required.filter((k) => !secrets[k]);

if (missing.length > 0) {
  console.error(`✗ Secrets obbligatori mancanti (MAIL_TRANSPORT=${transport}):`);
  for (const k of missing) console.error(`    ${k}`);
  console.error(`\n  Compila ${envFile} e riprova.`);
  process.exit(1);
}

const keys = Object.keys(secrets).sort();

console.log(`\nSecrets da inviare (${keys.length}) — sorgente: ${envFile}\n`);
for (const k of keys) {
  const isSecret = /PASSWORD|SECRET|SALT/.test(k);
  console.log(`  ${k}=${isSecret ? mask(secrets[k]) : secrets[k]}`);
}
if (skipped.length > 0) {
  console.log(`\n  Ignorate (fuori allow-list): ${skipped.join(', ')}`);
}

if (dryRun) {
  console.log('\n--dry-run: nessuna modifica applicata.');
  process.exit(0);
}

/**
 * Il CLI va invocato SENZA shell. Su Windows `shell: true` fa ricomporre gli
 * argomenti in una stringa che cmd.exe ri-analizza: un `&` dentro un secret
 * (tipico di IP_HASH_SALT o di una password) verrebbe letto come separatore di
 * comandi e spezzerebbe l'invocazione. Passando per l'entry JS del pacchetto
 * con l'eseguibile Node corrente, gli argomenti arrivano verbatim.
 */
function resolveSupabaseCli() {
  const req = createRequire(import.meta.url);
  try {
    const pkgPath = req.resolve('supabase/package.json', { paths: [ROOT] });
    const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin;
    const rel = typeof bin === 'string' ? bin : bin.supabase;
    const entry = join(dirname(pkgPath), rel);
    return existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

const cliArgs = ['secrets', 'set', ...keys.map((k) => `${k}=${secrets[k]}`)];

console.log('\nInvio a Supabase…\n');
const cliEntry = resolveSupabaseCli();
if (!cliEntry) {
  console.error('CLI supabase non trovato tra le dipendenze. Esegui `npm install`.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliEntry, ...cliArgs], {
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  console.error('\n✗ supabase secrets set non riuscito.');
  console.error('  Verifica di aver eseguito `npm run sb:login` e `npm run sb:link`.');
  process.exit(result.status ?? 1);
}

console.log('\n✓ Secrets aggiornati. Verifica con `npm run fn:secrets:list`.');
