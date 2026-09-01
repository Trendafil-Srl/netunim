/**
 * Albero di navigazione, derivato interamente dal JSON.
 * Aggiungere una pagina a un'area = aggiungere un oggetto a `pages[]`.
 */
import { sections, type AreaKey, type ContentPage } from './copy';

export interface NavLink {
  label: string;
  href: string;
}

export interface NavArea {
  key: AreaKey;
  label: string;
  href: string;
  children: NavLink[];
}

/** I due dropdown dell'header. */
export const navAreas: NavArea[] = (['commerciale', 'investigazione'] as AreaKey[]).map((key) => {
  const section = sections[key];
  return {
    key,
    label: section.title,
    href: section.route,
    children: section.pages.map((p) => ({ label: p.navLabel, href: p.route })),
  };
});

/** Link comuni a destra nell'header. */
export const navCommon: NavLink[] = [
  { label: 'Chi siamo', href: '/chi-siamo' },
  { label: 'Autorizzazioni', href: '/autorizzazioni' },
];

/** Link secondari, presenti nel footer e nel drawer mobile. */
export const navSecondary: NavLink[] = [
  { label: 'Metodo e valori', href: '/metodo' },
  { label: 'A chi ci rivolgiamo', href: '/clienti' },
  { label: 'Contatti', href: '/contatti' },
];

export const navLegal: NavLink[] = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Cookie policy', href: '/cookie-policy' },
];

export function areaPages(key: AreaKey): ContentPage[] {
  return sections[key].pages;
}

export interface Pager {
  prev: NavLink | null;
  next: NavLink | null;
  indexHref: string;
  indexLabel: string;
}

/**
 * Precedente/successiva DENTRO la stessa area, più la risalita all'indice.
 * Permette di attraversare un'area intera senza tornare al menu.
 */
export function pagerFor(key: AreaKey, slug: string): Pager {
  const section = sections[key];
  const pages = section.pages;
  const i = pages.findIndex((p) => p.slug === slug);

  const at = (idx: number): NavLink | null => {
    const p = pages[idx];
    return p ? { label: p.navLabel, href: p.route } : null;
  };

  return {
    prev: i > 0 ? at(i - 1) : null,
    next: i >= 0 && i < pages.length - 1 ? at(i + 1) : null,
    indexHref: section.route,
    indexLabel: section.title,
  };
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb per una pagina d'area. */
export function areaCrumbs(key: AreaKey, page?: ContentPage): Crumb[] {
  const section = sections[key];
  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];
  if (page) {
    crumbs.push({ label: section.title, href: section.route });
    crumbs.push({ label: page.navLabel });
  } else {
    crumbs.push({ label: section.title });
  }
  return crumbs;
}
