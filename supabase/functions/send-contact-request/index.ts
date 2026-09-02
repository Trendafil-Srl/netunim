/**
 * POST /functions/v1/send-contact-request
 * body: { "id": "<uuid>" }
 *
 * Rilegge il record con service_role, sceglie il destinatario in base all'area,
 * invia la mail e aggiorna lo stato. Idempotente: un secondo invio sullo stesso
 * id non rispedisce nulla.
 */
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createMailer } from './mailer.ts';
import {
  buildConfirmationHtml,
  buildConfirmationSubject,
  buildConfirmationText,
  buildHtml,
  buildSubject,
  buildText,
  type ContactRecord,
} from './template.ts';

const BodySchema = z.object({ id: z.string().uuid() });

/**
 * Letta a ogni richiesta, non all'avvio del modulo: un valore catturato al
 * boot dell'isolate sopravvivrebbe all'aggiornamento del secret, e il CORS
 * continuerebbe a puntare al dominio vecchio fino al riciclo dell'isolate.
 * Come per CONTACT_EMAIL_*, cambiare il secret basta: nessun redeploy.
 */
function siteUrl(): string {
  return Deno.env.get('SITE_URL') ?? 'https://netunim.com';
}

/** Log strutturato. Mai email o messaggio in chiaro. */
function log(level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ lvl: level, evt: event, ...extra }));
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Origin consentita = SITE_URL, mai '*': la function scrive dati personali.
  const site = siteUrl();
  const allowed = origin === site ? origin : site;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

/** Liste separate da virgola, per il CC interno. */
function recipientsFor(section: ContactRecord['section']): string[] {
  const raw =
    section === 'commerciale'
      ? Deno.env.get('CONTACT_EMAIL_COMMERCIALE')
      : Deno.env.get('CONTACT_EMAIL_INVESTIGAZIONE');

  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) {
    throw new Error(`Nessun destinatario configurato per l'area ${section}`);
  }
  return list;
}

/**
 * Hash dell'IP con salt segreto: il rate limit resta efficace senza
 * conservare l'indirizzo in chiaro (minimizzazione dei dati).
 */
async function hashIp(req: Request): Promise<string | null> {
  const salt = Deno.env.get('IP_HASH_SALT');
  if (!salt) return null;

  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim();
  if (!ip) return null;

  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/**
 * Logo servito dal sito, non incorporato come data URI.
 *
 * L'inline nacque perche' il dominio non era ancora attivo, ma si porta dietro
 * un difetto grosso: Gmail blocca del tutto le `data:` URI nelle immagini, per
 * cui il logo non si vedeva comunque, e diversi filtri antispam leggono quel
 * costrutto come tentativo di sottrarre contenuto all'analisi. Un URL assoluto
 * su HTTPS e' il modo normale di mettere un'immagine in una email.
 *
 * Il PNG e' lo stesso file di `public/brand/`, che l'host serve gia'.
 * (La copia in questa cartella non e' piu' usata dal codice.)
 */
function logoUrl(): string {
  return `${siteUrl()}/brand/netunim-logo-white.png`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  let id: string;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'invalid_body' }, 400, origin);
    id = parsed.data.id;
  } catch {
    return json({ error: 'invalid_json' }, 400, origin);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: record, error: readError } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    log('error', 'read_failed', { id, code: readError.code });
    return json({ error: 'read_failed' }, 500, origin);
  }
  if (!record) {
    log('warn', 'not_found', { id });
    return json({ error: 'not_found' }, 404, origin);
  }

  // Idempotenza: non rispedire mai la stessa richiesta.
  if (record.status === 'sent') {
    log('info', 'already_sent', { id });
    return json({ ok: true, alreadySent: true }, 200, origin);
  }

  // L'hash dell'IP viene calcolato qui: il client non invia mai l'indirizzo.
  const ipHash = await hashIp(req);
  if (ipHash && !record.ip_hash) {
    await supabase.from('contact_requests').update({ ip_hash: ipHash }).eq('id', id);
  }

  const contact = record as ContactRecord;

  try {
    const to = recipientsFor(contact.section);
    const mailer = createMailer();
    const logo = logoUrl();

    await mailer.send({
      to,
      replyTo: contact.email,
      subject: buildSubject(contact),
      html: buildHtml(contact, logo),
      text: buildText(contact),
    });

    await supabase
      .from('contact_requests')
      .update({
        status: 'sent',
        email_sent_at: new Date().toISOString(),
        notified_to: to.join(','),
        email_error: null,
      })
      .eq('id', id);

    log('info', 'sent', { id, section: contact.section, recipients: to.length });

    // Conferma al richiedente: un fallimento qui non compromette la notifica interna.
    if ((Deno.env.get('CONFIRMATION_ENABLED') ?? 'false').toLowerCase() === 'true') {
      try {
        await mailer.send({
          to: [contact.email],
          subject: buildConfirmationSubject(),
          html: buildConfirmationHtml(contact, logo),
          text: buildConfirmationText(contact),
        });
        log('info', 'confirmation_sent', { id });
      } catch (confirmError) {
        log('warn', 'confirmation_failed', {
          id,
          reason: String(confirmError).slice(0, 200),
        });
      }
    }

    return json({ ok: true }, 200, origin);
  } catch (err) {
    const reason = String(err).slice(0, 500);
    log('error', 'send_failed', { id, reason });

    await supabase
      .from('contact_requests')
      .update({ status: 'failed', email_error: reason })
      .eq('id', id);

    // Messaggio generico al client: mai lo stack trace di un errore SMTP.
    return json({ error: 'delivery_failed' }, 502, origin);
  }
});
