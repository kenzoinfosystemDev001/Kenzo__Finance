import type { Metadata } from 'next';
import Link from 'next/link';
import { getRefreshToken } from '@/lib/session';
import { BrandLogo } from '@/components/brand-logo';

export const metadata: Metadata = {
  title: 'Kenzo Infosystems — Business Management Software',
  description:
    'Vendor, inventory, enquiry, quotation and invoicing software for hardware distribution businesses.',
};

/**
 * Public landing page.
 *
 * Deliberately makes no API call. The home page is the first thing a visitor
 * and every uptime check sees, so it must render when the backend is asleep,
 * redeploying or unreachable - previously `/` asked the API who the user was,
 * so a cold backend turned the whole site into an error screen.
 *
 * The sign-in state is read from the session cookie alone, which is a hint
 * only: it decides which button to show, never what anyone is allowed to see.
 * Every protected page re-checks the session against the API, and the API
 * independently rejects unauthorised calls.
 */
export default async function LandingPage() {
  const hasSession = Boolean(await getRefreshToken());

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo />
          <Link
            href={hasSession ? '/dashboard' : '/login'}
            className="btn-primary"
          >
            {hasSession ? 'Open dashboard' : 'Sign in'}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="chip">Business Management Software</p>

          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Run the whole hardware business from one record of truth.
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Kenzo Infosystems replaces the spreadsheets and WhatsApp threads
            behind vendor onboarding, stock, enquiries, quotations and
            invoicing — with every document numbered, every change audited and
            nothing overwritten.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={hasSession ? '/dashboard' : '/login'}
              className="btn-primary"
            >
              {hasSession ? 'Open dashboard' : 'Sign in to your account'}
            </Link>
            <a href="#modules" className="btn-secondary">
              See what is included
            </a>
          </div>

          <p className="mt-4 text-sm text-ink-subtle">
            Access is issued by your administrator. There is no public sign-up.
          </p>
        </section>

        <section
          id="modules"
          className="border-t border-border bg-surface-muted"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              What is included
            </h2>
            <p className="mt-2 max-w-2xl text-base text-ink-muted">
              Modules ship in sequence. The two below are live today; the rest
              follow on the same data model.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((module) => (
                <li key={module.title} className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-ink">
                      {module.title}
                    </h3>
                    <span
                      className={
                        module.live
                          ? 'badge shrink-0 bg-success-subtle text-success'
                          : 'badge shrink-0 bg-surface-muted text-ink-subtle'
                      }
                    >
                      {module.live ? 'Live' : 'Planned'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {module.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Built for records that have to hold up
          </h2>

          <dl className="mt-8 grid gap-8 sm:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title}>
                <dt className="text-base font-semibold text-ink">
                  {principle.title}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {principle.description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <p className="text-sm text-ink-subtle">
            © {new Date().getFullYear()} Kenzo Infosystems. All rights
            reserved.
          </p>
          <Link
            href={hasSession ? '/dashboard' : '/login'}
            className="text-sm font-medium text-accent hover:underline"
          >
            {hasSession ? 'Open dashboard' : 'Sign in'}
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo className="h-10 w-10" priority />
      <div>
        <p className="text-sm font-bold leading-tight tracking-wide text-ink">
          KENZO INFOSYSTEMS
        </p>
        <p className="text-xs leading-tight text-ink-subtle">
          Business Management
        </p>
      </div>
    </div>
  );
}

const MODULES: { title: string; description: string; live: boolean }[] = [
  {
    title: 'Vendor management',
    description:
      'Vendors with validated GSTIN and PAN, multiple addresses and contacts, document uploads and OCR-assisted onboarding.',
    live: true,
  },
  {
    title: 'Inventory & products',
    description:
      'Products, brands, categories and locations, with an append-only stock ledger so on-hand quantity is always explainable.',
    live: true,
  },
  {
    title: 'Customers & enquiries',
    description:
      'Customer records and incoming enquiries, routed to the person responsible and tracked to an outcome.',
    live: false,
  },
  {
    title: 'Quotations',
    description:
      'Versioned quotations that are never overwritten: every revision stays readable exactly as it was sent.',
    live: false,
  },
  {
    title: 'Invoicing & payments',
    description:
      'Proforma invoices, payment capture and delivery tracking, with sequential numbering that cannot collide.',
    live: false,
  },
  {
    title: 'Reports & audit',
    description:
      'Exports and reporting over the same records, with an audit trail of who changed what and when.',
    live: false,
  },
];

const PRINCIPLES: { title: string; description: string }[] = [
  {
    title: 'Nothing is quietly overwritten',
    description:
      'Issued documents are immutable. Corrections create a new version and the earlier one stays on file, so a dispute can always be settled from the record.',
  },
  {
    title: 'Permissions enforced at the source',
    description:
      'Every endpoint declares the permission it needs and is refused without one. Hiding a menu item is presentation, not security.',
  },
  {
    title: 'Stock you can reconstruct',
    description:
      'Quantity on hand is the sum of a movement ledger rather than a number someone edited, so a wrong figure can be traced to the entry that caused it.',
  },
];
