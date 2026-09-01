/**
 * Helper metadati e JSON-LD.
 * Nessun markup Review/Rating: non esistono recensioni reali da dichiarare.
 */
import { company } from './copy';
import type { Crumb } from './nav';

export const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL || 'https://netunim.com'
).replace(/\/$/, '');

/** `{Titolo} · NETUNIM`, troncato a 60 caratteri. */
export function pageTitle(title: string): string {
  const full = `${title} · ${company.brandName}`;
  return full.length <= 60 ? full : `${title.slice(0, 60 - company.brandName.length - 4)}… · ${company.brandName}`;
}

/** Description da un lead, max 155 caratteri, taglio su confine di parola. */
export function metaDescription(lead: string): string {
  const clean = lead.replace(/\s+/g, ' ').trim();
  if (clean.length <= 155) return clean;
  const cut = clean.slice(0, 155);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export function canonical(pathname: string): string {
  const path = pathname === '/' ? '' : pathname.replace(/\/$/, '');
  return `${SITE_URL}${path}`;
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.name,
    alternateName: company.brandName,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/netunim-logo-navy.png`,
    image: `${SITE_URL}/og-default.png`,
    description: company.heroLead,
    vatID: company.vat.replace(/^P\.\s*IVA\s*/i, ''),
    telephone: company.phoneHref,
    email: company.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Galleria San Babila 4/C',
      postalCode: '20122',
      addressLocality: 'Milano',
      addressCountry: 'IT',
    },
    sameAs: [company.website],
  };
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      ...(crumb.href ? { item: `${SITE_URL}${crumb.href === '/' ? '' : crumb.href}` } : {}),
    })),
  };
}
