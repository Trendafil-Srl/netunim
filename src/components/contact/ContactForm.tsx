import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ContactRequestSchema, newRequestId, toRow } from '@/lib/schema';
import type { ContactFormCopy, AreaKey } from '@/lib/copy';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Errors = Partial<Record<string, string>>;

interface Props {
  copy: ContactFormCopy;
  defaultSection?: AreaKey;
  defaultSubjectType?: string;
  onSuccess?: () => void;
}

/** Submit più veloce di questa soglia = bot. */
const MIN_TIME_TO_SUBMIT_MS = 3000;

function readUtm(): Record<string, string> {
  try {
    const stored = sessionStorage.getItem('netunim:utm');
    return stored ? (JSON.parse(stored) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export default function ContactForm({
  copy,
  defaultSection,
  defaultSubjectType,
  onSuccess,
}: Props) {
  const [section, setSection] = useState<AreaKey | ''>(defaultSection ?? '');
  const [subjectType, setSubjectType] = useState(defaultSubjectType ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Salvato ma non notificato: il lead non va perso per un errore SMTP. */
  const [softWarning, setSoftWarning] = useState(false);

  const openedAt = useRef(Date.now());
  const summaryRef = useRef<HTMLDivElement>(null);

  const subjectOptions = useMemo(
    () => (section ? (copy.subjectTypes[section] ?? []) : []),
    [copy.subjectTypes, section],
  );

  // Le opzioni dipendono dall'area: al cambio, la tipologia va resettata.
  useEffect(() => {
    if (subjectType && !subjectOptions.includes(subjectType)) setSubjectType('');
  }, [subjectOptions, subjectType]);

  useEffect(() => {
    if (formError) summaryRef.current?.focus();
  }, [formError]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;

    const fd = new FormData(e.currentTarget);
    const honeypot = String(fd.get('website') ?? '');
    const tooFast = Date.now() - openedAt.current < MIN_TIME_TO_SUBMIT_MS;

    // Bot: mostriamo il successo senza scrivere nulla.
    if (honeypot !== '' || tooFast) {
      setStatus('success');
      onSuccess?.();
      return;
    }

    const raw = {
      section: String(fd.get('section') ?? ''),
      first_name: String(fd.get('first_name') ?? ''),
      last_name: String(fd.get('last_name') ?? ''),
      email: String(fd.get('email') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      company: String(fd.get('company') ?? ''),
      role: String(fd.get('role') ?? ''),
      subject_type: String(fd.get('subject_type') ?? ''),
      message: String(fd.get('message') ?? ''),
      privacy_accepted: fd.get('privacy_accepted') === 'on',
      website: honeypot,
    };

    const parsed = ContactRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setFormError('Controlla i campi segnalati e riprova.');
      setStatus('idle');
      return;
    }

    setErrors({});
    setFormError(null);
    setStatus('submitting');

    try {
      const { supabase } = await import('@/lib/supabase');
      // L'id nasce qui: la tabella non concede SELECT ad anon, quindi non
      // potrebbe essere riletto dopo l'insert (vedi ContactRequestRow.id).
      const id = newRequestId();
      const row = toRow(parsed.data, {
        id,
        source_page: window.location.pathname,
        utm: readUtm(),
        user_agent: navigator.userAgent,
      });

      // Passo 1 — il record viene salvato: da qui il lead è al sicuro.
      // Nessun .select(): chiederebbe return=representation, che senza policy
      // di lettura fa fallire l'intera insert con 401.
      const { error } = await supabase.from('contact_requests').insert(row);

      if (error) throw error;

      setStatus('success');
      onSuccess?.();

      // Passo 2 — notifica via email. Un fallimento qui non annulla il successo.
      try {
        const { error: fnError } = await supabase.functions.invoke('send-contact-request', {
          body: { id },
        });
        if (fnError) throw fnError;
      } catch (notifyError) {
        console.warn('[netunim] notifica non riuscita, richiesta registrata', notifyError);
        setSoftWarning(true);
      }
    } catch (err) {
      console.error('[netunim] invio non riuscito', err);
      setFormError(copy.errorText);
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div role="status">
        <h3 className="section-title text-xl text-[var(--accent-text)]">{copy.successTitle}</h3>
        <p className="mt-4 text-[var(--text-soft)]">{copy.successText}</p>
        {softWarning && (
          <p className="mt-4 border-l-[3px] border-l-[var(--accent-strong)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
            La richiesta è stata registrata, ma potresti non ricevere l&rsquo;email di conferma.
            Verrai ricontattato ugualmente.
          </p>
        )}
      </div>
    );
  }

  const err = (name: string) => errors[name];

  const fieldProps = (name: string) => ({
    name,
    id: `cf-${name}`,
    'aria-invalid': err(name) ? true : undefined,
    'aria-describedby': err(name) ? `cf-${name}-error` : undefined,
    className: `w-full rounded-[2px] border bg-[var(--surface)] px-3 py-2.5 text-[var(--text)] outline-none transition-colors focus-visible:border-[var(--accent)] ${
      err(name) ? 'border-[#FF8A8A]' : 'border-[var(--hairline)]'
    }`,
  });

  const Err = ({ name }: { name: string }) =>
    err(name) ? (
      <p id={`cf-${name}-error`} className="mt-1.5 text-xs text-[#FFB4B4]">
        {err(name)}
      </p>
    ) : null;

  const label = (name: string, text: string, required = false) => (
    <label
      htmlFor={`cf-${name}`}
      className="mb-1.5 block text-[11px] font-semibold tracking-[0.12em] text-[var(--text-muted)] uppercase"
    >
      {text}
      {required && (
        <span className="text-[var(--accent-text)]" aria-hidden="true">
          {' *'}
        </span>
      )}
    </label>
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="mb-6 border-l-[3px] border-l-[#FF8A8A] bg-[var(--surface)] p-4 text-sm text-[#FFD4D4]"
        >
          {formError}
        </div>
      )}

      <fieldset className="mb-6">
        <legend className="mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-[var(--text-muted)] uppercase">
          Area di interesse <span className="text-[var(--accent-text)]">*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {copy.sections.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-[2px] border p-3 text-sm transition-colors ${
                section === opt.value
                  ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                  : 'border-[var(--hairline)] hover:border-[var(--accent)]'
              }`}
            >
              <input
                type="radio"
                name="section"
                value={opt.value}
                checked={section === opt.value}
                onChange={() => setSection(opt.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="text-[var(--text-soft)]">{opt.label}</span>
            </label>
          ))}
        </div>
        <Err name="section" />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {label('first_name', 'Nome', true)}
          <input
            type="text"
            maxLength={80}
            autoComplete="given-name"
            {...fieldProps('first_name')}
          />
          <Err name="first_name" />
        </div>
        <div>
          {label('last_name', 'Cognome', true)}
          <input
            type="text"
            maxLength={80}
            autoComplete="family-name"
            {...fieldProps('last_name')}
          />
          <Err name="last_name" />
        </div>
        <div>
          {label('email', 'Email', true)}
          <input type="email" maxLength={160} autoComplete="email" {...fieldProps('email')} />
          <Err name="email" />
        </div>
        <div>
          {label('phone', 'Telefono')}
          <input type="tel" maxLength={40} autoComplete="tel" {...fieldProps('phone')} />
          <Err name="phone" />
        </div>
        <div>
          {label('company', 'Azienda / Studio')}
          <input
            type="text"
            maxLength={140}
            autoComplete="organization"
            {...fieldProps('company')}
          />
          <Err name="company" />
        </div>
        <div>
          {label('role', 'Ruolo')}
          <input
            type="text"
            maxLength={100}
            autoComplete="organization-title"
            {...fieldProps('role')}
          />
          <Err name="role" />
        </div>
      </div>

      <div className="mt-4">
        {label('subject_type', 'Tipologia di richiesta', true)}
        <select
          {...fieldProps('subject_type')}
          value={subjectType}
          onChange={(e) => setSubjectType(e.target.value)}
          disabled={!section}
        >
          <option value="">{section ? 'Seleziona…' : 'Scegli prima l’area di interesse'}</option>
          {subjectOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <Err name="subject_type" />
      </div>

      <div className="mt-4">
        {label('message', 'Descrivi brevemente la tua esigenza', true)}
        <textarea rows={5} maxLength={3000} {...fieldProps('message')} />
        <Err name="message" />
      </div>

      {/* Honeypot: fuori schermo, non focalizzabile, escluso dall'autofill. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label htmlFor="cf-website">Website</label>
        <input type="text" id="cf-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-6">
        <label className="flex items-start gap-3 text-sm text-[var(--text-soft)]">
          <input
            type="checkbox"
            name="privacy_accepted"
            id="cf-privacy_accepted"
            aria-invalid={err('privacy_accepted') ? true : undefined}
            aria-describedby={
              err('privacy_accepted') ? 'cf-privacy_accepted-error' : 'cf-privacy-note'
            }
            className="mt-1 accent-[var(--accent)]"
          />
          <span>
            Ho letto e accetto l&rsquo;
            <a href="/privacy" className="text-[var(--accent-text)] underline underline-offset-2">
              informativa privacy
            </a>
            <span className="text-[var(--accent-text)]" aria-hidden="true">
              {' *'}
            </span>
          </span>
        </label>
        <Err name="privacy_accepted" />
        <p id="cf-privacy-note" className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          {copy.privacyNote}
        </p>
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-[2px] bg-[var(--accent)] px-6 py-3.5 text-xs font-semibold tracking-[0.08em] text-[var(--color-navy-900)] uppercase transition-colors hover:bg-[var(--color-ice-100)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {status === 'submitting' && (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent-on)] border-t-transparent"
          />
        )}
        {status === 'submitting' ? 'Invio in corso…' : 'Invia la richiesta'}
      </button>
    </form>
  );
}
