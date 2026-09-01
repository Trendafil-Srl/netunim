#!/usr/bin/env node
/**
 * Apre la strada ai log della Edge Function.
 *
 * Il CLI Supabase 2.x non espone piu' alcun comando `logs`: i log delle Edge
 * Function si leggono dalla dashboard. Questo script ricava il project ref da
 * .env e stampa i link diretti, cosi' `npm run fn:logs` resta utile.
 *
 * In locale i log compaiono direttamente nel terminale di `npm run fn:serve`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = 'send-contact-request';

function readEnv(file) {
  const out = {};
  const p = join(ROOT, file);
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let v = line.slice(eq + 1).trim();
    if (!/^["']/.test(v)) {
      const h = v.indexOf(' #');
      if (h !== -1) v = v.slice(0, h).trim();
      if (v.startsWith('#')) v = '';
    }
    out[line.slice(0, eq).trim()] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnv('.env'), ...process.env };
let ref = env.SUPABASE_PROJECT_REF;

// Fallback: il ref e' anche il sottodominio dell'URL del progetto.
if (!ref || ref === 'DA_SOSTITUIRE_IN_FASE_4') {
  const m = (env.PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  ref = m?.[1];
}

if (!ref) {
  console.error('✗ Project ref non determinabile.');
  console.error('  Imposta SUPABASE_PROJECT_REF (o PUBLIC_SUPABASE_URL) in .env.');
  process.exit(1);
}

const base = `https://supabase.com/dashboard/project/${ref}`;

console.log(`
Log della Edge Function "${FN}"

  Invocazioni e log della function
  ${base}/functions/${FN}/logs

  Logs Explorer (query SQL su function_edge_logs)
  ${base}/logs/edge-functions

In locale i log escono nel terminale di:
  npm run fn:serve

Nota: il CLI Supabase 2.x non ha piu' un comando \`logs\`; questi log si
consultano dalla dashboard.
`);
