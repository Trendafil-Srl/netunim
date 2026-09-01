import { useCallback, useEffect, useRef, useState } from 'react';
import ContactForm from './ContactForm';
import type { ContactFormCopy, AreaKey } from '@/lib/copy';

interface Props {
  copy: ContactFormCopy;
  /** Preselezione contestuale derivata dall'area della pagina. */
  defaultSection?: AreaKey;
}

interface OpenDetail {
  section?: AreaKey;
  subjectType?: string;
}

const TITLE_ID = 'contact-modal-title';
const DESC_ID = 'contact-modal-lead';

export default function ContactModal({ copy, defaultSection }: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<AreaKey | undefined>(defaultSection);
  const [subjectType, setSubjectType] = useState<string | undefined>(undefined);
  /** Rimonta il form a ogni apertura: azzera stato, errori e time-to-submit. */
  const [formKey, setFormKey] = useState(0);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  /** Trigger a cui restituire il focus una volta completata la chiusura. */
  const pendingRestore = useRef<HTMLElement | null>(null);
  const supportsDialog = useRef(true);

  useEffect(() => {
    supportsDialog.current = typeof HTMLDialogElement === 'function';
  }, []);

  const close = useCallback(() => {
    // Il focus va restituito al trigger, ma non qui: dialog.close() e lo
    // smontaggio del nodo riazzerano il focus subito dopo. Lo si ripristina
    // nell'effetto sotto, che gira a commit avvenuto.
    pendingRestore.current = lastTrigger.current;
    lastTrigger.current = null;

    setOpen(false);
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    document.body.classList.remove('is-locked');
  }, []);

  // Chiusura completata: il focus torna al bottone che aveva aperto la modale.
  useEffect(() => {
    if (open) return;
    const trigger = pendingRestore.current;
    if (!trigger) return;
    pendingRestore.current = null;
    trigger.focus();
  }, [open]);

  // Apertura da qualunque ContactTrigger del sito, o da evento programmatico.
  useEffect(() => {
    const onTriggerClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-contact-trigger]',
      );
      if (!target) return;
      e.preventDefault();
      lastTrigger.current = target;
      const dataSection = target.dataset.section as AreaKey | undefined;
      setSection(dataSection ?? defaultSection);
      setSubjectType(target.dataset.subjectType || undefined);
      setFormKey((k) => k + 1);
      setOpen(true);
    };

    const onCustomOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail ?? {};
      lastTrigger.current = null;
      setSection(detail.section ?? defaultSection);
      setSubjectType(detail.subjectType);
      setFormKey((k) => k + 1);
      setOpen(true);
    };

    document.addEventListener('click', onTriggerClick);
    window.addEventListener('netunim:contact-open', onCustomOpen);
    return () => {
      document.removeEventListener('click', onTriggerClick);
      window.removeEventListener('netunim:contact-open', onCustomOpen);
    };
  }, [defaultSection]);

  // showModal() porta in dote focus trap ed Esc nativi.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      document.body.classList.add('is-locked');
      if (supportsDialog.current && !dialog.open) {
        dialog.showModal();
        // Primo campo del form, non il bottone di chiusura che lo precede nel DOM.
        dialog
          .querySelector<HTMLElement>('form input:not([type="hidden"]), form select, form textarea')
          ?.focus();
      }
    }
    return () => {
      document.body.classList.remove('is-locked');
    };
  }, [open]);

  // Fallback per browser senza <dialog>: Esc gestito a mano.
  useEffect(() => {
    if (!open || supportsDialog.current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const body = (
    <div className="relative">
      <button
        type="button"
        onClick={close}
        aria-label="Chiudi la finestra di contatto"
        className="absolute -top-1 right-0 flex h-10 w-10 items-center justify-center text-2xl leading-none text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
      >
        <span aria-hidden="true">×</span>
      </button>

      <h2 id={TITLE_ID} className="section-title pr-12 text-xl text-[var(--accent-text)]">
        {copy.modalTitle}
      </h2>
      <p id={DESC_ID} className="mt-3 mb-8 text-sm text-[var(--text-muted)]">
        {copy.modalLead}
      </p>

      <ContactForm
        key={formKey}
        copy={copy}
        defaultSection={section}
        defaultSubjectType={subjectType}
      />
    </div>
  );

  const panelClass =
    'bg-page w-full max-w-[680px] border border-[var(--hairline)] p-6 text-[var(--text)] md:p-10';

  if (!supportsDialog.current) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESC_ID}
        className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[rgb(6_14_28/0.8)] p-4 py-10"
      >
        <div className={panelClass}>{body}</div>
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={TITLE_ID}
      aria-describedby={DESC_ID}
      onClose={close}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className={`${panelClass} m-auto backdrop:bg-[rgb(6_14_28/0.8)]`}
    >
      {body}
    </dialog>
  );
}
