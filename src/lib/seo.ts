import { SITE } from '../data/tools';

export interface FaqItem {
  q: string;
  a: string;
}

export interface Crumb {
  name: string;
  href?: string;
}

export function absolute(path: string): string {
  return new URL(path, SITE.url).toString();
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    inLanguage: 'de-DE',
    description: SITE.description
  };
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description
  };
}

export function softwareSchema(opts: {
  name: string;
  description: string;
  path: string;
  category?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: opts.name,
    description: opts.description,
    url: absolute(opts.path),
    applicationCategory: opts.category ?? 'MultimediaApplication',
    operatingSystem: 'Webbrowser',
    inLanguage: 'de-DE',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR'
    },
    featureList: [
      'Verarbeitung direkt im Browser',
      'Kein Upload der Bilddatei',
      'Keine Anmeldung erforderlich'
    ],
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url
    }
  };
}

export function faqSchema(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a
      }
    }))
  };
}

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.href ? absolute(crumb.href) : undefined
    }))
  };
}

export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    mainEntityOfPage: absolute(opts.path),
    inLanguage: 'de-DE',
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url
    },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url
    }
  };
}

/** Serialisiert JSON-LD robust für die Einbettung in <script type="application/ld+json">. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
