-- ============================================================
-- NETUNIM · seed di sviluppo. Solo ambiente locale.
-- Due record fittizi, uno per area, gia' marcati 'handled':
-- non innescano invii e non sporcano le viste di lavoro.
-- ============================================================

insert into public.contact_requests
  (section, first_name, last_name, email, phone, company, role,
   subject_type, message, privacy_accepted, source_page, utm, status, notified_to)
values
  ('commerciale', 'Mario', 'Rossi', 'mario.rossi@example.com', '+39 02 0000000',
   'Servicer Example S.p.A.', 'Credit manager',
   'Indagine patrimoniale persona fisica',
   'Record di esempio per lo sviluppo locale. Nessun dato reale, nessuna richiesta effettiva da lavorare.',
   true, '/collection/rintraccio', '{}'::jsonb, 'handled', 'commerciale@example.com'),

  ('investigazione', 'Giulia', 'Bianchi', 'giulia.bianchi@example.com', null,
   'Studio Legale Example', 'Avvocato',
   'Investigazioni aziendali e sul personale',
   'Record di esempio per lo sviluppo locale. Nessun dato reale, nessuna richiesta effettiva da lavorare.',
   true, '/investigazioni/aziendali', '{}'::jsonb, 'handled', 'investigazioni@example.com');
