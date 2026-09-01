# NETUNIM — sito vetrina

Sito statico di **NETUNIM S.r.l.**, istituto investigativo milanese con due licenze ex art. 134 TULPS.
Astro 7 (output statico) + isole React, Supabase per le richieste di contatto, Edge Function per la
notifica via email.

---

## ⚠️ DA CONFERMARE prima del go-live

Nessuno di questi punti blocca lo sviluppo, ma tutti vanno chiusi prima di pubblicare.

| # | Voce | Valore attuale (ipotizzato) |
|---|---|---|
| 1 | Indirizzi email delle due aree | `info@sottolab.it`, `support@sottolab.it` (provvisori) |
| 2 | Casella mittente | `info@trendafil.com` — unica casella reale del tenant verificata. Se NETUNIM vuole un mittente sul proprio dominio, va **prima** creata la cassetta in Exchange |
| 3 | Application Access Policy per l'app Graph | **non ancora applicata**: oggi l'app può inviare come qualunque cassetta del tenant |
| 4 | Testo di informativa privacy e cookie policy | placeholder con `TODO:` visibili in pagina |
| 5 | Dominio e hosting di destinazione | `netunim.com` — Vercel / Netlify / Cloudflare Pages / server proprio? |
| 6 | Serve la versione inglese? | no (se sì, `astro:i18n` va predisposto **subito**: aggiungerlo dopo costa il triplo) |
| 7 | Serve un backoffice per leggere le richieste? | per ora mail + Supabase Studio |

---

## Setup locale in meno di 10 minuti

**Prerequisiti:** Node ≥ 20.11 e Docker Desktop **in esecuzione** (serve allo stack Supabase locale).

```bash
npm run setup
```

Esegue in sequenza: `npm install`, creazione di `.env` e `.env.functions` dagli esempi, avvio dello
stack Supabase locale, applicazione delle migration e generazione dei tipi TypeScript.

Poi copia i valori stampati da `npm run sb:status` dentro `.env`:

```dotenv
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=<anon key stampata da sb:status>
PUBLIC_SITE_URL=http://localhost:4321
```

Infine:

```bash
npm run dev
```

> Il file `.env` creato dallo scaffolding contiene i segnaposto `DA_SOSTITUIRE_IN_FASE_4`.
> Finché non li sostituisci il sito si costruisce e si naviga, ma il form non riesce a scrivere.

### Comandi principali

| Comando | Cosa fa |
|---|---|
| `npm run dev` | server di sviluppo su `:4321` |
| `npm run verify` | typecheck + lint + build: il cancello prima di ogni commit |
| `npm run sb:start` / `sb:stop` | stack Supabase locale |
| `npm run sb:reset` | riapplica migration e seed da zero |
| `npm run sb:types` | rigenera `src/lib/database.types.ts` |
| `npm run sb:test:rls` | verifica l'isolamento RLS con la sola anon key |
| `npm run fn:serve` | esegue la Edge Function in locale |
| `npm run fn:test` | smoke test end-to-end del flusso di contatto |
| `npm run fn:logs` | stampa i link ai log della function sulla dashboard |
| `npm run fn:secrets` | invia i secrets da `.env.functions` a Supabase |

---

## Architettura

```
Browser                          Supabase
  │                                  │
  │ 1. insert (anon key, RLS)        │
  ├─────────────────────────────────>│  contact_requests  ← il lead è salvato qui
  │                                  │
  │ 2. functions.invoke              │
  ├─────────────────────────────────>│  send-contact-request (service_role)
  │                                  │       │
  │ <──── successo già dopo il passo 1│       └──> SMTP / Graph ──> destinatario d'area
```

**L'interfaccia mostra il successo già dopo il passo 1.** Se il passo 2 fallisce il record resta
salvato con `status='failed'` e l'utente vede un avviso soft: un errore SMTP non deve mai far
perdere un lead.

### Perché l'insert è lato browser

L'alternativa più sicura è eliminare la policy `anon insert` e far fare tutto alla Edge Function
(validazione + insert con `service_role` + invio). Elimina del tutto la superficie di scrittura
pubblica, al costo di **non poter salvare il record se la function è giù**.

Qui è stata scelta la prima: la tabella non è leggibile da anon (verificato da `sb:test:rls`), la
policy di insert impone `privacy_accepted = true` e `status = 'new'`, e un trigger limita a 3
richieste per 10 minuti dallo stesso `ip_hash`. Per passare all'altro modello: rimuovi la policy
`anon can insert contact requests` e sposta la validazione dentro `index.ts`.

### Struttura del contenuto

Tutta la copy vive in `content/copy-netunim.json`, estratta verbatim dalla presentazione aziendale.
Le pagine d'area sono generate da `getStaticPaths()` su `sectionCollection.pages[]` e
`sectionInvestigazione.pages[]`: **aggiungere una pagina significa aggiungere un oggetto al JSON**,
non creare un file `.astro`.

`TopicBlock.astro` sceglie il layout in base alle chiavi presenti nel topic (`blocks`, `steps`,
`checklist`, `livelli`, `ambiti`, `principi`…). Un solo componente, nessuna pagina copia-incollata.

---

## Configurazione SMTP Microsoft 365

```
host      smtp.office365.com
port      587
security  STARTTLS   (il TLS implicito su 465 NON è supportato da Exchange Online)
auth      SMTP_USER / SMTP_PASSWORD
from      deve coincidere con SMTP_USER, oppure SMTP_USER deve avere "Send As" sulla casella
```

Prerequisiti lato tenant:

1. SMTP AUTH abilitato a livello di organizzazione **e** sulla singola cassetta:

```powershell
Set-CASMailbox -Identity noreply@netunim.com -SmtpClientAuthenticationDisabled $false
```

2. Verifica dello stato:

```powershell
Get-CASMailbox -Identity noreply@netunim.com | Format-List SmtpClientAuthenticationDisabled
```

3. Se sull'account c'è MFA serve una **app password** (richiede che siano consentite dai criteri di
   accesso condizionale). In alternativa, un account di servizio dedicato escluso dalla CA policy.

> **Il progetto usa già `MAIL_TRANSPORT=graph`.** Le variabili SMTP restano compilate come
> ripiego, ma il percorso attivo è Graph: l'app registration esiste, ha `Mail.Send` con consenso
> amministratore, e non dipende da una basic auth in via di ritiro.

---

## Migrazione a Graph entro dicembre 2026

Microsoft sta ritirando la Basic Authentication per SMTP AUTH client submission in Exchange Online:

- **fine dicembre 2026** — disabilitata nei tenant esistenti (l'amministratore può riattivarla temporaneamente)
- **da gennaio 2027** — i tenant nuovi non possono usarla affatto
- **seconda metà 2027** — annuncio della rimozione definitiva

`mailer.ts` espone un'unica interfaccia `Mailer` con due implementazioni già pronte. La migrazione è
un cambio di variabile d'ambiente, non di codice.

**Passi:**

1. **Entra ID → App registrations → New registration.** Nome: `NETUNIM · sito web mailer`.
2. **Certificates & secrets → New client secret.** Annota valore e scadenza.
3. **API permissions → Add a permission → Microsoft Graph → Application permissions →
   `Mail.Send`** → *Grant admin consent*.
4. **Restringi il permesso a una sola cassetta** con una Application Access Policy: senza questo
   passo l'app può inviare come *qualunque* utente del tenant.

```powershell
New-ApplicationAccessPolicy `
  -AppId <GRAPH_CLIENT_ID> `
  -PolicyScopeGroupId info@trendafil.com `
  -AccessRight RestrictAccess `
  -Description "NETUNIM sito web: invio solo dalla casella del sito"

Test-ApplicationAccessPolicy -Identity info@trendafil.com -AppId <GRAPH_CLIENT_ID>
```

> **`GRAPH_SENDER_UPN` deve essere una cassetta che esiste davvero nel tenant.** Se non esiste,
> Graph risponde `404 ErrorInvalidUser` e l'invio fallisce senza altra spiegazione. È stato
> esattamente il caso di `noreply@netunim.com`: indirizzo plausibile, cassetta mai creata.
> Non basta che il dominio sia verificato in Entra ID.

5. Compila `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SENDER_UPN` in
   `.env.functions`, imposta `MAIL_TRANSPORT=graph`.
6. `npm run fn:secrets && npm run fn:deploy && npm run fn:test`.

Le variabili SMTP possono restare configurate: tornare indietro è solo `MAIL_TRANSPORT=smtp`.

---

## Deploy

### Supabase (remoto)

```bash
npm run setup:remote
```

Esegue login, link al progetto, push delle migration, invio dei secrets e deploy della function.
Richiede `SUPABASE_PROJECT_REF` in `.env`.

### Sito statico

`npm run build` produce `dist/`, servibile da qualunque host statico. Imposta `PUBLIC_SITE_URL` sul
dominio finale **prima** della build: entra in canonical, Open Graph, sitemap e JSON-LD.

**In CI il file `.env` non serve.** È in `.gitignore` e sul runner non esiste: `check-env.mjs`
accetta le variabili dall'ambiente, che è dove Netlify le mette. Vanno impostate in
*Site configuration → Environment variables*, e devono essere disponibili in fase di **build**
(non solo a runtime), perché il sito è statico e i valori vengono compilati dentro `dist/`:

| Variabile | Serve a |
|---|---|
| `PUBLIC_SUPABASE_URL` | client Supabase nel browser |
| `PUBLIC_SUPABASE_ANON_KEY` | idem — chiave pubblica, **mai** la service_role |
| `PUBLIC_SITE_URL` | canonical, Open Graph, sitemap, JSON-LD |

`SUPABASE_PROJECT_REF` serve solo agli script della CLI: in build non viene letto.

### Header di sicurezza da configurare sull'host

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

Questi cinque si possono applicare così come sono. La **CSP no**, e va trattata a parte.

#### La CSP richiede una scelta esplicita

⚠️ **Non impostare `script-src 'self'` da solo: rompe il sito.** Astro inietta in ogni pagina
degli script inline — il bootstrap delle direttive `client:idle` e `client:media`, più lo script
di reveal. Con `script-src 'self'` il browser li blocca, le isole React non si idratano e il form
di contatto smette di funzionare, senza alcun errore visibile all'utente.

Due strade corrette:

**a) Hash generati da Astro (consigliata).** In `astro.config.mjs`:

```js
security: { csp: true }
```

Astro calcola gli hash SHA-256 di ogni script e stile inline e li scrive in un
`<meta http-equiv="content-security-policy">` per pagina. Le direttive aggiuntive
(`connect-src` verso Supabase, `frame-ancestors`, `form-action`) si passano in
`security.csp.directives`. Da riverificare a ogni cambio di isole.

**b) Header sull'host con `'unsafe-inline'` nello `script-src`.** Più semplice, ma rinuncia
proprio alla protezione principale della CSP: se non si aggiunge nient'altro, tanto vale non
metterla.

In entrambi i casi `connect-src` va limitato al solo dominio Supabase del progetto
(`https://<project-ref>.supabase.co`), e `'unsafe-inline'` in `style-src` resta necessario per gli
stili scoped generati da Astro.

#### Netlify

Gli header vanno in `public/_headers` (Astro copia `public/` in `dist/`) oppure in un
`netlify.toml`. **Attenzione ai Pretty URLs:** il progetto usa `trailingSlash: 'never'`, quindi
tutti i link interni sono `/contatti`, mentre Netlify con i Pretty URLs attivi redirige verso
`/contatti/`. Il sito funziona lo stesso, ma ogni link interno costa un 301 e l'URL servito non
coincide con il canonical. Si disattiva con:

```toml
# netlify.toml
[build.processing.html]
  pretty_urls = false
```

---

## Privacy e minimizzazione dei dati

Scelte deliberate, coerenti con quanto l'azienda dichiara nelle proprie pagine:

- **L'IP non viene mai conservato in chiaro.** Il client non lo invia; la Edge Function calcola
  `SHA-256(IP_HASH_SALT + ':' + ip)` troncato a 32 caratteri. Il rate limit resta efficace senza
  conservare l'indirizzo.
- **Nessun `localStorage`** per i dati del form: sono dati personali. Solo i parametri `utm_*` in
  `sessionStorage`, cancellati alla chiusura della scheda.
- **Nessuna analytics di terze parti.** Se servisse, si valuti Plausible o Umami self-hosted dietro
  un flag: è un sito che vende riservatezza.
- **Font self-hosted** via `@fontsource-variable`: nessuna richiesta a CDN esterne.
- **Log strutturati senza dati personali**: email e messaggio non compaiono mai nei log della
  function.
- La tabella `contact_requests` è leggibile **solo** con `service_role`.

---

## Test manuali

### Isolamento RLS

```bash
npm run sb:test:rls
```

Verifica che con la sola anon key si possa inserire ma **non** leggere, aggiornare o cancellare.

### Honeypot

Apri la modale, valorizza da console il campo nascosto e invia: la richiesta viene scartata in
silenzio e l'interfaccia mostra comunque il successo. Nessuna riga deve comparire in tabella.

```js
document.querySelector('#cf-website').value = 'bot';
```

### Time-to-submit

Compila e invia il form in meno di 3 secondi dall'apertura: scartato allo stesso modo.

### Rate limit

Invia 4 richieste in meno di 10 minuti dallo stesso dispositivo: la quarta viene rifiutata dal
trigger con `rate_limit_exceeded`. Richiede `IP_HASH_SALT` configurato (senza salt l'`ip_hash` resta
`null` e il limite non si applica).

### Idempotenza

```bash
npm run fn:test
```

Invoca due volte la function sullo stesso `id`: la seconda risponde `{ alreadySent: true }` senza
rispedire l'email.

### Leggere i log della function

Il CLI Supabase 2.x **non ha più un comando `logs`**: i log delle Edge Function si consultano dalla
dashboard. `npm run fn:logs` ricava il project ref da `.env` e stampa i link diretti. In locale,
invece, i log escono nel terminale di `npm run fn:serve`.

Serve quando il browser mostra *"la richiesta è stata registrata, ma potresti non ricevere
l'email"*: quel messaggio significa che l'insert è riuscito e la notifica no, ma la causa reale al
client resta volutamente nascosta.

Più rapido dei log, però, è leggere la causa dove la function la scrive già: il campo
`email_error` della riga fallita.

```bash
npx supabase db query --linked "select created_at, section, status, email_error from public.contact_requests order by created_at desc limit 5"
```

`status='failed'` con `email_error` valorizzato è un invio tentato e rifiutato; `status='new'` senza
errore è una richiesta salvata per cui la function non ha mai concluso (non invocata, oppure andata
in timeout prima di poter aggiornare la riga).

Errori Graph ricorrenti, così come compaiono in `email_error`:

| Messaggio | Causa |
|---|---|
| `HTTP 404, ErrorInvalidUser` | `GRAPH_SENDER_UPN` non è una cassetta del tenant |
| `HTTP 403, ErrorAccessDenied` | Application Access Policy che esclude quella cassetta |
| `HTTP 401` | client secret scaduto o revocato |
| `richiesta token fallita (HTTP 401, invalid_client)` | `GRAPH_CLIENT_SECRET` errato |

### Nessun secret nel bundle

```bash
grep -riE "service_role|SMTP_PASSWORD|CLIENT_SECRET" dist/
```

Non deve restituire nulla.

---

## Accessibilità

Target: **Accessibility 100**, contrasto AA su tutti i testi.

Due scelte non ovvie, prese per rispettare la soglia AA senza tradire la palette:

1. **`--accent-text`.** L'accento dell'area investigazione (`#467896`) rende **3.69:1** sul fondo
   navy: sufficiente per bordi e filetti (soglia 3:1), sotto la soglia di **4.5:1** richiesta al
   testo piccolo come gli eyebrow da 11px. `--accent` resta il colore di marca per bordi e fondi;
   `--accent-text` (`#6FA6BF`, 6.63:1) è la variante usata dal testo.

2. **`--accent-on`.** Il testo sopra un fondo pieno in accento cambia con l'area: navy su ghiaccio
   rende 10.57:1, ma navy su teal solo 3.69:1. Sull'area investigazione i bottoni pieni usano il
   bianco (4.79:1).

Il gradiente `bg-statement` parte da `#B9DBE3`: il testo bianco su quel lato non raggiungerebbe AA,
quindi gli statement usano `bg-statement--scrim`, che sovrappone uno scrim scuro mantenendo
percepibile il tono ghiaccio.

Altre garanzie: skip link, landmark corretti, `<nav aria-label>` distinti, focus visibile ovunque
(mai `outline: none` senza sostituto), `Esc` chiude la modale e **il focus torna al trigger**,
`prefers-reduced-motion` disattiva ogni transizione.

---

## Struttura

```
src/
├─ lib/        copy.ts (loader tipizzato)  nav.ts  schema.ts  seo.ts  supabase.ts
├─ components/
│  ├─ ui/        primitivi: Section, Card, Callout, StatementBlock, PagerNav…
│  ├─ layout/    Header (due dropdown), Footer, MobileNav, SkipLink
│  ├─ sections/  Hero, AreaSwitch, TopicBlock
│  └─ contact/   ContactModal, ContactForm, ContactTrigger
├─ layouts/    BaseLayout  ContentLayout  SectionLayout
└─ pages/      pagine comuni + due route dinamiche [slug].astro

supabase/
├─ migrations/  20260901120000_contact_requests.sql
├─ seed.sql
└─ functions/send-contact-request/  index.ts  mailer.ts  template.ts
```

### Isole React

Solo tre, tutto il resto è `.astro` puro con zero JS al client:

| Isola | Direttiva | Perché |
|---|---|---|
| `ContactModal` | `client:idle` | form, stato, fetch Supabase |
| `MobileNav` | `client:media="(max-width: 1023px)"` | drawer, non caricato su desktop |
| `ContactForm` (in `/contatti`) | `client:idle` | form a pagina intera |

---

## Pagina di styleguide

`/styleguide` mostra ogni componente nelle due varianti d'area. È `noindex` ed è una pagina di
lavoro: **valuta se rimuoverla prima del go-live** (`src/pages/styleguide.astro`).
