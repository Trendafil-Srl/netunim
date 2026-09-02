/**
 * Trasporto email astratto, con due implementazioni selezionabili da
 * MAIL_TRANSPORT.
 *
 * Perché due: Microsoft sta ritirando la Basic Authentication per SMTP AUTH
 * client submission in Exchange Online. Da fine dicembre 2026 viene disabilitata
 * nei tenant esistenti, dal 2027 i tenant nuovi non possono usarla affatto.
 * SMTP con utente e password funziona oggi ma ha una scadenza: GraphMailer è il
 * percorso di migrazione, già pronto.
 */

export interface MailMessage {
  to: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}

/* ------------------------------------------------------------------ */
/* SMTP — Office 365, STARTTLS su 587. Attivo fino a dicembre 2026.     */
/* ------------------------------------------------------------------ */

/**
 * Nessun errore JS puo' salvare una connessione che la piattaforma non
 * consente: se il worker viene terminato, la riga resta in `status='new'`
 * senza spiegazioni. Il timeout serve a trasformare il caso "connessione
 * appesa" in un errore registrato, che e' diagnosticabile.
 */
const SMTP_TIMEOUT_MS = 15_000;

export class SmtpMailer implements Mailer {
  async send(msg: MailMessage): Promise<void> {
    await Promise.race([
      this.deliver(msg),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `SMTP: nessuna risposta entro ${SMTP_TIMEOUT_MS} ms. ` +
                  'Sulle Edge Function ospitate le porte SMTP in uscita sono ' +
                  'bloccate: usa MAIL_TRANSPORT=graph.',
              ),
            ),
          SMTP_TIMEOUT_MS,
        )
      ),
    ]);
  }

  private async deliver(msg: MailMessage): Promise<void> {
    // Import dinamico: il modulo SMTP non viene caricato quando si usa Graph.
    // Se il runtime lo rifiuta, l'errore va catturato qui e non lasciato
    // propagare come crash del modulo.
    let SMTPClient: typeof import('denomailer').SMTPClient;
    try {
      ({ SMTPClient } = await import('denomailer'));
    } catch (err) {
      throw new Error(`SMTP: caricamento del client fallito (${String(err).slice(0, 120)})`);
    }

    const from = requireEnv('SMTP_FROM');
    const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'NETUNIM';

    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com',
        port: Number(Deno.env.get('SMTP_PORT') ?? '587'),
        // tls:false + porta 587 = STARTTLS. Exchange Online non supporta
        // il TLS implicito su 465.
        tls: false,
        auth: {
          username: requireEnv('SMTP_USER'),
          password: requireEnv('SMTP_PASSWORD'),
        },
      },
    });

    try {
      await client.send({
        from: `${fromName} <${from}>`,
        to: msg.to,
        replyTo: msg.replyTo,
        subject: msg.subject,
        content: msg.text,
        html: msg.html,
      });
    } finally {
      await client.close();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Microsoft Graph — client credentials. Percorso di migrazione.        */
/* ------------------------------------------------------------------ */

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export class GraphMailer implements Mailer {
  private token: { value: string; expiresAt: number } | null = null;

  private async accessToken(): Promise<string> {
    // 60s di margine per non usare un token in scadenza durante la richiesta.
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }

    const tenant = requireEnv('GRAPH_TENANT_ID');
    const body = new URLSearchParams({
      client_id: requireEnv('GRAPH_CLIENT_ID'),
      client_secret: requireEnv('GRAPH_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      // Del corpo si riporta solo `error`, che e' un enum documentato
      // (invalid_client, unauthorized_client...): error_description puo'
      // contenere identificativi del tenant, quindi resta fuori dal log.
      const code = await res
        .json()
        .then((j) => (j as { error?: string }).error ?? 'sconosciuto')
        .catch(() => 'illeggibile');
      throw new Error(`Graph: richiesta token fallita (HTTP ${res.status}, ${code})`);
    }

    const json = (await res.json()) as TokenResponse;
    this.token = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return this.token.value;
  }

  async send(msg: MailMessage): Promise<void> {
    const sender = requireEnv('GRAPH_SENDER_UPN');
    const token = await this.accessToken();

    const payload = {
      message: {
        subject: msg.subject,
        body: { contentType: 'HTML', content: msg.html },
        toRecipients: msg.to.map((address) => ({ emailAddress: { address } })),
        ...(msg.replyTo
          ? { replyTo: [{ emailAddress: { address: msg.replyTo } }] }
          : {}),
      },
      /**
       * Copia in Posta inviata della cassetta mittente. Vale il costo: senza,
       * un 202 di Graph non e' distinguibile da un messaggio poi rifiutato a
       * valle, e non resta alcuna prova di cosa sia stato spedito e quando.
       * Il contenuto arriva comunque in una casella aziendale, quindi la copia
       * non aggiunge un'esposizione che non ci sia gia'.
       */
      saveToSentItems:
        (Deno.env.get('GRAPH_SAVE_TO_SENT_ITEMS') ?? 'true').toLowerCase() !== 'false',
    };

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok && res.status !== 202) {
      // Il codice Graph e' un enum, non contiene dati personali, e distingue i
      // casi che altrimenti sarebbero indistinguibili: ErrorInvalidUser =
      // casella mittente inesistente, ErrorAccessDenied = Application Access
      // Policy che esclude la casella, ErrorSendAsDenied = delega mancante.
      const code = await res
        .json()
        .then((j) => (j as { error?: { code?: string } }).error?.code ?? 'sconosciuto')
        .catch(() => 'illeggibile');
      // L'indirizzo del mittente resta fuori: il vincolo e' che nei log non
      // finiscano email in chiaro, e GRAPH_SENDER_UPN si legge dai secrets.
      throw new Error(`Graph: invio fallito (HTTP ${res.status}, ${code})`);
    }
  }
}

export function createMailer(): Mailer {
  const transport = (Deno.env.get('MAIL_TRANSPORT') ?? 'smtp').toLowerCase();
  switch (transport) {
    case 'graph':
      return new GraphMailer();
    case 'smtp':
      return new SmtpMailer();
    default:
      throw new Error(`MAIL_TRANSPORT non valido: ${transport}. Usa "smtp" oppure "graph".`);
  }
}
