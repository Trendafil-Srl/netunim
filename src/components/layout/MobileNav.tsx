import { useEffect, useRef, useState } from 'react';
import type { NavArea, NavLink } from '@/lib/nav';

interface Props {
  areas: NavArea[];
  common: NavLink[];
  secondary: NavLink[];
  contactLabel: string;
}

/**
 * Drawer full-screen sotto i 1024px. Accordion per area.
 * Il bottone Contattaci riusa l'evento globale della modale.
 */
export default function MobileNav({ areas, common, secondary, contactLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Blocca lo scroll del body senza layout shift (scrollbar-gutter: stable sull'html).
  useEffect(() => {
    document.body.classList.toggle('is-locked', open);
    return () => document.body.classList.remove('is-locked');
  }, [open]);

  // Esc chiude e restituisce il focus al trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open]);

  const openContact = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('netunim:contact-open', { detail: {} }));
  };

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? 'Chiudi il menu' : 'Apri il menu'}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 flex-col items-center justify-center gap-[5px]"
      >
        <span
          className={`block h-[2px] w-6 bg-[var(--text)] transition-transform duration-200 ${
            open ? 'translate-y-[7px] rotate-45' : ''
          }`}
        />
        <span
          className={`block h-[2px] w-6 bg-[var(--text)] transition-opacity duration-200 ${
            open ? 'opacity-0' : ''
          }`}
        />
        <span
          className={`block h-[2px] w-6 bg-[var(--text)] transition-transform duration-200 ${
            open ? '-translate-y-[7px] -rotate-45' : ''
          }`}
        />
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          ref={panelRef}
          className="bg-page fixed inset-0 top-[72px] z-40 overflow-y-auto overscroll-contain px-6 pt-8 pb-16"
        >
          <nav aria-label="Navigazione principale mobile">
            <ul className="flex flex-col gap-1">
              {areas.map((area) => {
                const isOpen = expanded === area.key;
                return (
                  <li key={area.key} className="border-b border-[var(--hairline)] py-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : area.key)}
                      className="flex w-full items-center justify-between py-3 text-left"
                    >
                      <span className="section-title text-base">{area.label}</span>
                      <span aria-hidden="true" className="text-[var(--accent-text)]">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="flex flex-col gap-1 pb-4">
                        <li>
                          <a
                            href={area.href}
                            className="block py-2 text-sm text-[var(--accent-text)]"
                            onClick={() => setOpen(false)}
                          >
                            Panoramica dell&rsquo;area
                          </a>
                        </li>
                        {area.children.map((child) => (
                          <li key={child.href}>
                            <a
                              href={child.href}
                              className="block py-2 text-sm text-[var(--text-soft)]"
                              onClick={() => setOpen(false)}
                            >
                              {child.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}

              {[...common, ...secondary].map((link) => (
                <li key={link.href} className="border-b border-[var(--hairline)]">
                  <a
                    href={link.href}
                    className="section-title block py-5 text-base"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <button
            type="button"
            onClick={openContact}
            className="mt-8 inline-flex w-full items-center justify-center rounded-[2px] bg-[var(--accent)] px-6 py-4 text-xs font-semibold tracking-[0.08em] text-[var(--accent-on)] uppercase"
          >
            {contactLabel}
          </button>
        </div>
      )}
    </div>
  );
}
