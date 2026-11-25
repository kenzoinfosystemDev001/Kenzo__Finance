# Project Structure

This document describes the repository layout after the folder restructure.
The application code is unchanged; only folder locations and the paths that
point at them were updated.

## Folder tree

```text
Kenzo__Finance/
├── frontend/              Next.js web application
│   ├── public/            Static assets (logo)
│   ├── scripts/           start.js (production start with port-conflict check)
│   └── src/
│       ├── app/           App Router routes (pages, route handlers, middleware entry)
│       ├── components/    Shared UI components
│       ├── lib/           Shared client logic: API client, session, types, labels
│       └── middleware.ts
├── backend/               NestJS API
│   ├── src/
│       ├── app.module.ts, main.ts
│       ├── common/        Shared authz, guards, filters, DTOs, PDF/export/utility code
│       ├── config/        Environment validation
│       ├── database/      PrismaService and database wiring
│       └── <feature>/     One folder per business module (vendors, quotations, payments, ...)
│   ├── jest.config.json, nest-cli.json, tsconfig*.json, package.json
├── database/
│   ├── prisma/
│   │   ├── schema.prisma  Prisma data model (PostgreSQL)
│   │   └── migrations/    Applied migration history - never edit or reorder
│   └── seeds/
│       └── seed.ts        Initial super-admin seed
├── docs/                  Product, architecture, deployment and audit documents
├── .vscode/
├── .env.example           Environment template (the real .env is never committed)
├── .gitignore
├── package.json           npm workspaces root (frontend, backend) and root scripts
├── package-lock.json
├── render.yaml            Render blueprint (must stay at the repository root)
└── README.md
```

## Applications

**Frontend (`frontend/`)** - Next.js 15 with the App Router. Routes live in
`src/app/(dashboard)/<module>/`. Shared UI is in `src/components/`, and shared
client code (API calls, session, types, labels) is in `src/lib/`. Imports use
the `@/` alias for `src/`.

**Backend (`backend/`)** - NestJS 11 with Prisma. Each business module is one
folder under `src/`. Shared code is in `src/common/`, configuration in
`src/config/`, and the Prisma service in `src/database/`. Imports from
`database/` use relative paths from the module.

## Database

- Schema: `database/prisma/schema.prisma`
- Migrations: `database/prisma/migrations/` (the existing history is preserved)
- Seed: `database/seeds/seed.ts`, which reads the root `.env`

Prisma commands point at the schema explicitly:

```bash
npx prisma validate --schema database/prisma/schema.prisma
npx prisma migrate dev --schema database/prisma/schema.prisma      # development only
npx prisma migrate deploy --schema database/prisma/schema.prisma   # production
```

## Commands

Run from the repository root.

| Purpose | Command |
| --- | --- |
| Install dependencies | `npm install` |
| API dev server | `npm run api:dev` |
| Web dev server | `npm run web:dev` |
| Both dev servers | `npm run dev` |
| Generate Prisma client | `npm run db:generate` |
| Create a dev migration | `npm run db:migrate` |
| Apply migrations (production) | `npm run db:deploy` |
| Seed the database | `npm run db:seed` |
| Prisma Studio | `npm run db:studio` |
| Build the API | `npm run api:build` (runs `prisma generate` then `nest build`) |
| Build the web app | `npm run web:build` |
| API tests | `npm run api:test` |
| Start the API (production) | `npm run start` |

## Build and deployment

- **Render** reads `render.yaml` at the repository root. Build command:
  `npm install && npm run render:build` (migrate deploy, generate, seed, build).
  Start command: `npm run render:start` (`node backend/dist/main.js`).
- The **frontend** build reads `NEXT_PUBLIC_API_URL` at build time. Set it in
  the frontend host's build environment; changing it needs a rebuild.
- Environment variables are read from the repository-root `.env` by the
  backend (when started from the root or from `backend/`) and by the seed.
  Next.js does not read the root `.env`.
- Storage: `STORAGE_LOCAL_ROOT=./storage` resolves against the working
  directory. Under the workspace scripts that is `backend/storage/`, which is
  git-ignored.

## Not present

- `.github/workflows/`: the repository has no GitHub Actions workflows.
- `packages/`, `infrastructure/`, root `scripts/`: no shared packages or
  infrastructure configuration exist yet. Create them when there is content for them.
