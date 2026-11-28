import { MODULE_DIRECTORY } from '@/app/(dashboard)/admin/admin-directory';

/** A page the header search can open directly. */
export interface PageResult {
  label: string;
  /** The module it belongs to, shown under the label. */
  context: string;
  href: string;
}

/**
 * Read permission of the module that owns a route. The directory leaves most
 * links without a permission (it is written for administrators), so the
 * search derives it here to never offer a page the user cannot open.
 */
const ROUTE_PERMISSIONS: Array<[prefix: string, permission: string]> = [
  ['/vendors', 'vendor.read'],
  ['/products', 'product.read'],
  ['/companies', 'company.read'],
  ['/inventory', 'stock.read'],
  ['/customers', 'customer.read'],
  ['/enquiries', 'enquiry.read'],
  ['/quotations', 'quotation.read'],
  ['/proforma-invoices', 'proforma.read'],
  ['/final-invoices', 'invoice.read'],
  ['/payments', 'payment.read'],
  ['/deliveries', 'delivery.read'],
  ['/reports', 'analytics.dashboard'],
  ['/sales-history', 'analytics.products'],
  ['/users', 'user.read'],
  ['/admin', 'settings.manage'],
  ['/appearance', 'settings.manage'],
];

function routePermission(href: string): string | undefined {
  const path = href.split('?')[0];
  return ROUTE_PERMISSIONS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
}

const normalise = (value: string) => value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Every page the user may open: each module (opening its main page) and each of its links. */
export function pagesFor(permissions: string[]): Array<PageResult & { haystack: string; labelKey: string }> {
  const allowed = (href: string, explicit?: string) => {
    const required = explicit ?? routePermission(href);
    return !required || permissions.includes(required);
  };
  const pages: Array<PageResult & { haystack: string; labelKey: string }> = [];
  for (const module of MODULE_DIRECTORY) {
    const links = module.links.filter((link) => allowed(link.href, link.permission));
    if (links.length === 0) continue;
    pages.push({ label: module.title, context: 'Module', href: links[0].href, haystack: normalise(module.title), labelKey: normalise(module.title) });
    for (const link of links) {
      pages.push({
        label: link.label,
        context: module.title,
        href: link.href,
        haystack: normalise(`${link.label} ${module.title}`),
        labelKey: normalise(link.label),
      });
    }
  }
  return pages;
}

/**
 * Pages matching every word of the query, best first: the module itself, then
 * labels starting with the query, then labels containing it, then pages that
 * match only through their module's name.
 */
export function matchPages(query: string, permissions: string[], limit = 6): PageResult[] {
  const q = normalise(query);
  if (!q) return [];
  const words = q.split(' ');
  // Plurals match their singular: "payments" -> "payment", "deliveries" -> "delivery".
  const has = (text: string, word: string) =>
    text.includes(word) ||
    (word.length > 4 && word.endsWith('ies') && text.includes(`${word.slice(0, -3)}y`)) ||
    (word.length > 3 && word.endsWith('s') && text.includes(word.slice(0, -1)));
  const scored = pagesFor(permissions)
    .filter((page) => words.every((word) => has(page.haystack, word)))
    .map((page) => {
      const isModule = page.context === 'Module';
      // Modules first, then labels starting with the query, then labels containing it.
      const score = isModule ? 0 : page.labelKey.startsWith(q) ? 1 : words.every((word) => has(page.labelKey, word)) ? 2 : 3;
      return { page, score };
    })
    .sort((a, b) => a.score - b.score);

  const seen = new Set<string>();
  const results: PageResult[] = [];
  for (const { page } of scored) {
    if (seen.has(page.href)) continue;
    seen.add(page.href);
    results.push({ label: page.label, context: page.context, href: page.href });
    if (results.length === limit) break;
  }
  return results;
}
