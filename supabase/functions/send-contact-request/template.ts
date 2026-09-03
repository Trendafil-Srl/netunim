/**
 * Composizione del messaggio: HTML brandizzato + versione testo.
 * La versione testo è obbligatoria: migliora la deliverability e serve ai
 * client che non renderizzano HTML.
 */

export interface ContactRecord {
  id: string;
  created_at: string;
  section: 'commerciale' | 'investigazione';
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  role: string | null;
  subject_type: string;
  message: string;
  source_page: string | null;
  utm: Record<string, string> | null;
  user_agent: string | null;
}

const AREA_LABEL: Record<ContactRecord['section'], string> = {
  commerciale: 'Netunim Commerciale',
  investigazione: 'Netunim Investigativa',
};

const COLORS = {
  bg: '#0C1830',
  surface: '#152543',
  text: '#FFFFFF',
  soft: '#D6F5F8',
  muted: '#9CC8D8',
  accent: '#8FD3E0',
  hairline: '#24506B',
};

/** Il logo viaggia inline: il dominio potrebbe non essere ancora online. */
export const LOGO_CID = 'netunim-logo';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Data e ora in fuso Europe/Rome, indipendente dal fuso del runtime. */
export function formatRome(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function buildSubject(record: ContactRecord): string {
  const area = AREA_LABEL[record.section];
  const name = `${record.first_name} ${record.last_name}`.trim();
  return `[NETUNIM · ${area}] ${record.subject_type} — ${name}`;
}

interface Field {
  label: string;
  value: string;
  /** Se presente, il valore viene reso cliccabile (es. tel: sul telefono). */
  href?: string;
}

function fieldsOf(record: ContactRecord): Field[] {
  const fields: Field[] = [
    { label: 'Area', value: AREA_LABEL[record.section] },
    { label: 'Tipologia', value: record.subject_type },
    { label: 'Nome', value: `${record.first_name} ${record.last_name}`.trim() },
    { label: 'Email', value: record.email },
  ];

  // Il numero arriva in E.164 dal form: si presta a un tel: cliccabile.
  if (record.phone) {
    fields.push({ label: 'Telefono', value: record.phone, href: `tel:${record.phone}` });
  }
  if (record.company) fields.push({ label: 'Azienda / Studio', value: record.company });
  if (record.role) fields.push({ label: 'Ruolo', value: record.role });

  fields.push({ label: 'Ricevuta il', value: formatRome(record.created_at) });
  if (record.source_page) fields.push({ label: 'Pagina di origine', value: record.source_page });

  const utm = record.utm ?? {};
  const utmKeys = Object.keys(utm);
  if (utmKeys.length > 0) {
    fields.push({
      label: 'Campagna',
      value: utmKeys.map((k) => `${k}=${utm[k]}`).join(' · '),
    });
  }

  if (record.user_agent) fields.push({ label: 'User agent', value: record.user_agent });

  return fields;
}

export function buildHtml(record: ContactRecord, logoSrc: string): string {
  const rows = fieldsOf(record)
    .map(
      (f) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.hairline};color:${COLORS.muted};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${escapeHtml(f.label)}</td>
          <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.hairline};color:${COLORS.text};font-size:14px;vertical-align:top;">${
            f.href
              ? `<a href="${escapeHtml(f.href)}" style="color:${COLORS.accent};text-decoration:none;">${escapeHtml(f.value)}</a>`
              : escapeHtml(f.value)
          }</td>
        </tr>`,
    )
    .join('');

  const message = escapeHtml(record.message).replace(/\r?\n/g, '<br />');

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(buildSubject(record))}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${COLORS.bg};border:1px solid ${COLORS.hairline};">
            <tr>
              <td style="padding:28px 24px;border-bottom:1px solid ${COLORS.hairline};">
                <img src="${logoSrc}" alt="NETUNIM" width="148" height="28" style="display:block;border:0;" />
                <p style="margin:16px 0 0;color:${COLORS.accent};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                  Nuova richiesta di contatto
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;">
                  ${rows}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 24px;">
                <p style="margin:0 0 8px;color:${COLORS.muted};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                  Messaggio
                </p>
                <div style="background:${COLORS.surface};border-left:3px solid ${COLORS.accent};padding:16px;color:${COLORS.soft};font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
                  ${message}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid ${COLORS.hairline};">
                <p style="margin:0;color:${COLORS.muted};font-size:12px;font-family:Arial,Helvetica,sans-serif;">
                  Rispondi a questa email per contattare direttamente il richiedente.
                </p>
                <p style="margin:8px 0 0;color:${COLORS.muted};font-size:11px;font-family:monospace;">
                  Record: ${escapeHtml(record.id)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildText(record: ContactRecord): string {
  const lines = [
    'NETUNIM — Nuova richiesta di contatto',
    '='.repeat(46),
    '',
    ...fieldsOf(record).map((f) => `${f.label}: ${f.value}`),
    '',
    'Messaggio:',
    '-'.repeat(46),
    record.message,
    '-'.repeat(46),
    '',
    'Rispondi a questa email per contattare direttamente il richiedente.',
    `Record: ${record.id}`,
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Conferma al richiedente: sobria, senza dettagli sensibili.           */
/* ------------------------------------------------------------------ */

export function buildConfirmationSubject(): string {
  return 'NETUNIM — abbiamo ricevuto la tua richiesta';
}

export function buildConfirmationHtml(record: ContactRecord, logoSrc: string): string {
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(buildConfirmationSubject())}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border:1px solid ${COLORS.hairline};">
            <tr>
              <td style="padding:28px 24px;border-bottom:1px solid ${COLORS.hairline};">
                <img src="${logoSrc}" alt="NETUNIM" width="148" height="28" style="display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:${COLORS.soft};font-size:14px;line-height:1.65;">
                <p style="margin:0 0 16px;">Gentile ${escapeHtml(record.first_name)},</p>
                <p style="margin:0 0 16px;">
                  abbiamo ricevuto la tua richiesta relativa a
                  <strong style="color:${COLORS.text};">${escapeHtml(AREA_LABEL[record.section])}</strong>.
                  Un referente NETUNIM ti ricontatterà al recapito indicato per un primo confronto
                  riservato.
                </p>
                <p style="margin:0 0 16px;">
                  Nessuna indagine viene intrapresa in assenza di un mandato scritto che ne
                  definisca finalità e perimetro.
                </p>
                <p style="margin:24px 0 0;color:${COLORS.muted};font-size:12px;">
                  Questo messaggio è una conferma automatica: non è necessario rispondere.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildConfirmationText(record: ContactRecord): string {
  return [
    `Gentile ${record.first_name},`,
    '',
    `abbiamo ricevuto la tua richiesta relativa a ${AREA_LABEL[record.section]}.`,
    'Un referente NETUNIM ti ricontatterà al recapito indicato per un primo confronto riservato.',
    '',
    'Nessuna indagine viene intrapresa in assenza di un mandato scritto che ne definisca',
    'finalità e perimetro.',
    '',
    'Questo messaggio è una conferma automatica: non è necessario rispondere.',
    '',
    'NETUNIM S.r.l.',
  ].join('\n');
}
