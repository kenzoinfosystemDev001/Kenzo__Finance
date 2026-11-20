# Kenzo Infosystems ERP & Business Management System

Monorepo for the Kenzo Infosystems ERP. **Module 1 (Vendor Management) and
Module 2 (Inventory Management) are implemented.** Later modules follow the
roadmap in [`docs/`](./docs).

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind |
| Backend | NestJS 11 + TypeScript |
| Database | PostgreSQL (Neon) |
| ORM | Prisma 6 |
| Auth | JWT access/refresh, Argon2id hashing, backend RBAC |
| API docs | Swagger at `/api/docs` (non-production only) |

> The repository uses **npm workspaces**, not pnpm. `corepack`/`pnpm` is broken
> on the current machine (signature verification error), and npm workspaces
> cover the same need.

---

## 1. Prerequisites

- Node.js 20.9 or newer (tested on 20.18)
- A Neon PostgreSQL database

## 2. Configure the environment

```bash
cp .env.example .env
```

Then fill in `.env`. The application refuses to start if anything required is
missing or malformed, rather than failing later on a request.

### Required values

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string, used by the running app |
| `DIRECT_URL` | Neon **direct** (non-pooled) string, used by `prisma migrate` |
| `AUTH_ACCESS_SECRET` | 32+ characters |
| `AUTH_REFRESH_SECRET` | 32+ characters, **must differ** from the access secret |
| `SEED_SUPERADMIN_EMAIL` | First administrator account |
| `SEED_SUPERADMIN_PASSWORD` | 12+ characters. No default exists by design |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Neon gives you both connection strings in its dashboard. The pooled host
contains `-pooler`; the direct one does not. Prisma migrations must use the
direct connection — migrations do not work reliably through a pooler.

## 3. Install, migrate, seed

```bash
npm install
npm run db:generate      # generate the Prisma client
npm run db:migrate       # create the schema in Neon
npm run db:seed          # reference data + the first administrator
```

The seed creates **only** permissions, roles, document number sequences,
vendor categories and one administrator. It never creates sample vendors,
brands, products or transactions.

## 4. Run

```bash
npm run dev              # API on :4000, web on :3000
```

| URL | What |
| --- | --- |
| http://localhost:3000 | Web application |
| http://localhost:4000/api/v1 | API |
| http://localhost:4000/api/docs | Swagger (development only) |
| http://localhost:4000/api/v1/health/ready | Readiness + database check |

To run the production web server, build it first, then start it from the
workspace root:

```powershell
npm run build --workspace @kenzo-erp/web
npm run start --workspace @kenzo-erp/web
```

The web server uses port `3000` by default. Set `PORT` in PowerShell to use a
different port; the start script checks availability and reports the owning
process without terminating it:

```powershell
$env:PORT = '3001'
npm run start --workspace @kenzo-erp/web
```

Inspect a listener on Windows with
`Get-NetTCPConnection -LocalPort 3000 -State Listen`. Check the reported PID
with `Get-Process -Id <PID>`. Stop the server with Ctrl+C in the terminal
that started it. If that terminal is unavailable, use
`Stop-Process -Id <PID>` only after confirming the PID belongs to the server
you intend to stop.

Sign in with the seeded administrator and change the password immediately
(**Sign out menu → change password** endpoint, or `POST /auth/change-password`).

## 5. Tests

```bash
npm run api:test         # 84 unit tests
```

Covered: GSTIN checksum validation, duplicate-vendor rules, OCR draft
single-use enforcement, RBAC fail-closed behaviour, upload signature
validation, CSV injection escaping, value normalisation, and the stock ledger
(movement direction, negative-stock prevention, mandatory adjustment reasons,
single opening balance, derived balances).

## 6. Inventory and the stock ledger

Stock is an **append-only ledger**. There is no editable quantity column: the
on-hand figure is always `SUM(quantityDelta)` over recorded movements, so a
balance cannot drift from the history that produced it. A mistake is corrected
by posting a reversing movement, never by rewriting a row.

**Stock tracking is off by default**, because catalogue-only vs physical stock
is still an open business decision (see [`docs/01_PRD.md`](./docs/01_PRD.md)
section 10). With it off, products are a catalogue and no quantity exists;
stock endpoints return `409` rather than a misleading zero.

A Super Admin turns it on at **Settings → Inventory → Track stock quantities**.
Then, per product, record an opening balance to establish the starting count.

| Movement | Direction | Notes |
| --- | --- | --- |
| `OPENING_BALANCE` | + | Allowed once per product per location |
| `RECEIPT` | + | Goods in |
| `ISSUE` | − | Goods out |
| `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | ± | **Reason required** |
| `RETURN_IN` / `RETURN_OUT` | ± | Customer / vendor returns |

Quantity is always submitted as a positive number; the type decides the sign.
Stock cannot go negative unless `inventory.allowNegativeStock` is enabled.
Later modules (goods receipt, delivery) will post into this same ledger with a
`referenceType`/`referenceId` rather than maintaining quantities of their own.

---

## Repository layout

```
kenzo_finance/
├── apps/
│   ├── api/                      NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma     Identity/RBAC + Module 1 models
│   │   │   └── seed.ts           Reference data only
│   │   └── src/
│   │       ├── auth/             Login, refresh rotation, password change
│   │       ├── vendors/          Module 1 core
│   │       ├── companies/        Brands
│   │       ├── products/         Catalogue (minimal; Module 2 extends it)
│   │       ├── documents/        Private upload/download
│   │       ├── ocr/              Pluggable extraction + review flow
│   │       ├── audit/            Audit log writer
│   │       ├── numbering/        Concurrency-safe document numbers
│   │       ├── storage/          Private file storage adapter
│   │       └── common/           Guards, filters, DTOs, validators
│   └── web/                      Next.js frontend
│       └── src/
│           ├── app/(auth)/       Login
│           ├── app/(dashboard)/  Application shell and modules
│           ├── components/       Shared UI and the vendor form
│           └── lib/              Server-side API client, session, actions
└── docs/                         PRD, workflows, architecture, DFDs
```

## Security notes

- Tokens are stored in **httpOnly cookies** set by the Next server, never in
  `localStorage`. The access token never reaches browser JavaScript.
- Authorisation is enforced by NestJS guards. The `PermissionsGuard` **fails
  closed**: a route with no declared permission is refused, so forgetting a
  decorator cannot expose an endpoint.
- Uploads are validated by **file signature**, not by the client's declared
  MIME type or extension. Storage keys are generated server-side.
- Documents are served only through a permission-checked endpoint; nothing
  under the storage root is statically served.
- Refresh tokens are stored as SHA-256 hashes and rotate on every use; reuse of
  a rotated token revokes the whole session family.
- Passwords use Argon2id at OWASP-recommended parameters.
- The seed never creates a default password.

## What is deliberately not built yet

These depend on business decisions that are still open (see
[`docs/01_PRD.md`](./docs/01_PRD.md) section 10). Adding them later is an
additive migration; guessing them now would force a destructive one.

- Physical stock quantities, warehouses and the stock ledger
- Purchase orders, goods receipt and vendor bills
- Branch / multi-company columns
- Vendor supply prices on vendor-product mappings

## OCR

`OCR_PROVIDER=stub` (default) reads text files and stores scanned files without
inventing values; the review screen says so. `OCR_PROVIDER=google-vision` with
`OCR_API_KEY` reads images and the first 5 pages of PDF/TIFF through Google
Cloud Vision. Either way extraction only fills a draft: a vendor is created
only when a user reviews and confirms it, and the source file is attached.

## Integrating later modules

See [`docs/06_VENDOR_MODULE_INTEGRATION.md`](./docs/06_VENDOR_MODULE_INTEGRATION.md)
for how other modules reference vendors, brands and products without copying them.
