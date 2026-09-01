/**
 * Schema condiviso client (isola React) ↔ Edge Function.
 * Unica definizione della forma di una richiesta di contatto.
 */
import { z } from 'zod';

export const ContactRequestSchema = z.object({
  section: z.enum(['commerciale', 'investigazione']),
  first_name: z.string().trim().min(1, 'Campo obbligatorio').max(80),
  last_name: z.string().trim().min(1, 'Campo obbligatorio').max(80),
  email: z.string().trim().email('Indirizzo email non valido').max(160),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  company: z.string().trim().max(140).optional().or(z.literal('')),
  role: z.string().trim().max(100).optional().or(z.literal('')),
  subject_type: z.string().min(1, 'Seleziona una tipologia').max(120),
  message: z
    .string()
    .trim()
    .min(20, 'Descrivi la richiesta in almeno 20 caratteri')
    .max(3000),
  privacy_accepted: z.literal(true, {
    errorMap: () => ({ message: "Devi accettare l'informativa privacy" }),
  }),
  // Honeypot: se valorizzato, la richiesta viene scartata silenziosamente.
  website: z.literal('').optional(),
});

export type ContactRequestInput = z.infer<typeof ContactRequestSchema>;

/** Payload effettivamente scritto su `contact_requests`. */
export interface ContactRequestRow {
  /**
   * Generato dal client. Non è una scelta estetica: la tabella non espone
   * alcuna policy di SELECT ad anon, quindi PostgREST non può restituire la
   * riga inserita (`return=representation` → 401). Conoscere l'id in anticipo
   * è l'unico modo per invocare poi la Edge Function senza aprire in lettura
   * la tabella.
   */
  id: string;
  section: 'commerciale' | 'investigazione';
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  role: string | null;
  subject_type: string;
  message: string;
  privacy_accepted: true;
  source_page: string | null;
  utm: Record<string, string>;
  user_agent: string | null;
}

/** UUID v4. `randomUUID` manca fuori dai contesti sicuri: fallback esplicito. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Normalizza le stringhe vuote dei campi facoltativi in null. */
export function toRow(
  input: ContactRequestInput,
  meta: {
    id: string;
    source_page: string;
    utm: Record<string, string>;
    user_agent: string;
  },
): ContactRequestRow {
  const orNull = (v: string | undefined) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };

  return {
    id: meta.id,
    section: input.section,
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: orNull(input.phone),
    company: orNull(input.company),
    role: orNull(input.role),
    subject_type: input.subject_type,
    message: input.message.trim(),
    privacy_accepted: true,
    source_page: meta.source_page.slice(0, 300),
    utm: meta.utm,
    user_agent: meta.user_agent.slice(0, 400),
  };
}
