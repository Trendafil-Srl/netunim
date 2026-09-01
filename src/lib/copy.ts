/**
 * Loader tipizzato della copy NETUNIM.
 *
 * Fonte unica di verità: `content/copy-netunim.json`, estratta verbatim dalla
 * presentazione aziendale. Questo modulo NON genera testo: tipizza e normalizza
 * soltanto. Qualsiasi stringa mostrata a video deve provenire da qui.
 */
import rawCopy from '../../content/copy-netunim.json';

export type AreaKey = 'commerciale' | 'investigazione';

export interface Company {
  name: string;
  brandName: string;
  tagline: string;
  payoffEn: string;
  payoffIt: string;
  claimHome: string;
  claimVerbs: string;
  heroSubtitle: string;
  heroLead: string;
  vat: string;
  rea: string;
  legalAddress: string;
  operationalAddress: string;
  operationalAddressNote: string;
  pec: string;
  email: string;
  website: string;
  phone: string;
  phoneHref: string;
}

/** Blocco generico: titolo + elenco puntato, oppure titolo + testo. */
export interface Block {
  title: string;
  intro?: string;
  items?: string[];
  text?: string;
  variant?: 'warning' | 'info';
}

export interface Step {
  n: string;
  title: string;
  items?: string[];
  text?: string;
}

export interface ChecklistItem {
  n: string;
  text: string;
}

export interface Tier {
  n: string;
  title: string;
  subtitle: string;
  items: string[];
}

/** Coppia titolo + testo: ambiti, servizi, benefici. */
export interface TitledText {
  title: string;
  text: string;
}

export interface NumberedText {
  n: string;
  title: string;
  text: string;
}

export interface Gruppo {
  n: string;
  title: string;
  items: string[];
}

export interface Licenza {
  title: string;
  holder: string;
  body?: string;
  items?: string[];
  detail: string;
}

export interface Disclaimer {
  title: string;
  text: string;
}

export interface Principio {
  n: string;
  icon: string;
  title: string;
  short: string;
  text: string;
}

/** Nota a piè di topic: avvertenze, blocchi AI, livelli avanzati. */
export interface NoteBlock {
  title?: string;
  text: string;
}

export interface StatementData {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  kicker?: string;
  chips?: string[];
}

/**
 * Un topic è l'unità di contenuto: ogni pagina ne ospita al massimo due.
 * Le chiavi presenti determinano il layout scelto da TopicBlock.
 */
export interface Topic {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  variant?: string;
  blocks?: Block[];
  steps?: Step[];
  fasi?: Step[];
  checklist?: ChecklistItem[];
  livelli?: Tier[];
  ambiti?: TitledText[];
  servizi?: TitledText[];
  benefici?: TitledText[];
  ragioni?: NumberedText[];
  blocchi?: NumberedText[];
  gruppi?: Gruppo[];
  licenze?: Licenza[];
  disclaimers?: Disclaimer[];
  principi?: Principio[];
  visionTitle?: string;
  visionLead?: string;
  visionItems?: string[];
  principiTitle?: string;
  advanced?: NoteBlock;
  aiBlock?: NoteBlock;
  warning?: NoteBlock;
  disclaimer?: string;
  statement?: StatementData;
  closing?: string | NoteBlock;
}

/** Pagina interna a un'area, generata da getStaticPaths(). */
export interface ContentPage {
  route: string;
  slug: string;
  navLabel: string;
  title: string;
  topics: Topic[];
}

export interface AreaSection {
  key: AreaKey;
  route: string;
  eyebrow: string;
  title: string;
  hook: string;
  lead: string;
  payoff: string;
  audience: string;
  ctaLabel: string;
  pages: ContentPage[];
}

/** Pagina comune (chi siamo, autorizzazioni, metodo, clienti). */
export interface CommonPage {
  route: string;
  title: string;
  topics: Topic[];
}

export interface HomeArea {
  index: string;
  eyebrow: string;
  title: string;
  route: string;
  payoff: string;
  hook: string;
  lead: string;
  audience: string;
  specs: { k: string; v: string }[];
}

export interface HomePage {
  route: string;
  hero: { eyebrow: string; sub: string; lead: string; payoff: string };
  bivio: { title: string; lead: string; closing: string; aree: HomeArea[] };
  trustStrip: { title: string; lead: string };
  closing: { claim: string; verbs: string; payoff: string };
}

export interface ContactFormCopy {
  modalTitle: string;
  modalLead: string;
  sections: { value: AreaKey; label: string }[];
  subjectTypes: Record<AreaKey, string[]>;
  fields: {
    name: string;
    label: string;
    type: string;
    required: boolean;
    minLength?: number;
    maxLength?: number;
    optionsFrom?: string;
  }[];
  privacyNote: string;
  successTitle: string;
  successText: string;
  errorText: string;
}

export interface Copy {
  company: Company;
  pages: {
    home: HomePage;
    chiSiamo: CommonPage;
    autorizzazioni: CommonPage;
    metodo: CommonPage;
    clienti: CommonPage;
  };
  sectionCollection: AreaSection;
  sectionInvestigazione: AreaSection;
  contactForm: ContactFormCopy;
  statements: StatementData[];
}

export const copy = rawCopy as unknown as Copy;

export const company = copy.company;
export const contactForm = copy.contactForm;
export const statements = copy.statements;

export const sections: Record<AreaKey, AreaSection> = {
  commerciale: copy.sectionCollection,
  investigazione: copy.sectionInvestigazione,
};

/** Etichetta commerciale dell'area, usata in oggetti email e breadcrumb. */
export function areaLabel(key: AreaKey): string {
  return sections[key].title;
}

/** Ricava la chiave d'area da un pathname. Null sulle pagine comuni. */
export function areaFromPath(pathname: string): AreaKey | null {
  if (pathname.startsWith('/collection')) return 'commerciale';
  if (pathname.startsWith('/investigazioni')) return 'investigazione';
  return null;
}

/** Uno statement riutilizzabile, per id. */
export function statementById(id: string): StatementData | undefined {
  return statements.find((s) => s.id === id);
}

/** Normalizza `closing`, che nel JSON è stringa oppure { title, text }. */
export function normalizeClosing(closing: Topic['closing']): NoteBlock | null {
  if (!closing) return null;
  return typeof closing === 'string' ? { text: closing } : closing;
}
