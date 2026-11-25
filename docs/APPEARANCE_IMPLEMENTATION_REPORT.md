# Appearance Implementation Report

Scope: five-colour theme, bold sidebar typography, and three admin-managed background images (login, sidebar, main workspace), with backend enforcement, storage, audit and tests.

## 1. Files changed

**API (`backend/src`)**
- `settings/settings.service.ts`: adds `branding.sidebarBackgroundDocumentId` and `branding.workspaceBackgroundDocumentId` keys, with defaults and descriptions.
- `branding/branding.service.ts`: generalised from login-only to three kinds (`login`, `sidebar`, `workspace`).
- `branding/branding.controller.ts`: new endpoints for the sidebar and workspace images. Existing login endpoints are kept and behave as before.

**Web (`frontend/src`)**
- `app/globals.css`: design tokens replaced with the five-colour palette. Dark-mode overrides removed. Table headers, primary buttons and disabled states follow the spec.
- `components/sidebar.tsx`: background layer, bold labels (`font-bold`), clearer active state, Appearance entry (permission `settings.manage`).
- `components/background-image.tsx` (new): shared image layer. Falls back to the default colour if the image fails to load.
- `components/icons.tsx`: `IconImage` added.
- `app/(dashboard)/layout.tsx`: loads the active images and applies the sidebar and workspace backgrounds.
- `app/(dashboard)/appearance/page.tsx` and `appearance-cards.tsx` (new): Admin → Appearance with three independent cards and the administrator contact field.
- `app/(dashboard)/settings/page.tsx`: the old "Sign-in Page" card removed (it now lives on Appearance). `login-branding-settings.tsx` deleted.
- `app/appearance-image/[kind]/route.ts` (new): serves sidebar and workspace images to signed-in sessions only.
- `app/(auth)/login/page.tsx`, `login-form.tsx`: palette tokens, safe background component.
- `lib/appearance-types.ts` (new), `lib/branding.ts`, `lib/branding-actions.ts`: shared types, config fetch, and server actions.
- Stat-card and status-pill colours mapped onto the palette. The only non-palette colour kept is the semantic orange-to-warning token.

No Prisma migration was added. Image references use the existing `Setting` table (`key` is unique), so each kind has at most one active image by construction.

## 2. Colour palette

| Token | Value | Used for |
|---|---|---|
| `--accent`, `--sidebar`, `--ink` | `#2C3E50` | Primary buttons, sidebar, headings |
| `--accent-hover`, `--sidebar-hover` | `#34495E` | Hover, active nav, secondary |
| `--ink-subtle` | `#7F8C8D` | Secondary text, icons |
| `--border`, `--sidebar-muted` | `#BDC3C7` | Borders, disabled states |
| `--canvas`, `--surface-muted` | `#ECF0F1` | Workspace background, hover rows |
| `--surface` | `#FFFFFF` | Cards, tables, forms |

The tokens are stored as RGB channels so Tailwind opacity modifiers work. Semantic colours (danger, warning, success) remain for status feedback only.

## 3. Sidebar typography

All sidebar labels use `font-bold` (700), including nested items. Active items use `#34495E` with a light left bar; hover uses `#34495E`.

## 4. Background images

- **Login**: shown behind the brand panel on desktop under a `#2C3E50` tint at 85%. On small screens the card is shown without an image.
- **Sidebar**: behind the rail under a `#2C3E50` tint at 85%.
- **Workspace**: fixed behind all authenticated pages, under a `#ECF0F1` tint at 85%. Cards and tables sit on white surfaces. No opaque full-page overlay.

Each card on Admin → Appearance: preview of the selected file before anything is uploaded (local object URL, revoked afterwards), **Apply** to upload, **Replace**, **Restore default** (with confirmation), and the active file's name, size and upload date. Previews of files that were never uploaded are never shown; the default is shown as its real colour.

## 5. Security and authorisation

- Writes (`POST`/`DELETE` under `/branding/appearance/:kind`) require `settings.manage` on the backend. Frontend hiding is not relied on.
- Reads of the active image (`GET /branding/appearance/:kind/image`) require a signed-in session. The web proxy route forwards the session token server-side, so the browser never receives the API token and cannot read images anonymously.
- The public endpoints (`GET /branding/login`, `GET /branding/login/background`) expose only the login image id and support email. No file names, sizes or other metadata.
- The file type is checked from its bytes (`detectFileType`), not from the filename or browser MIME type. Limit: 5 MB, PNG/JPEG/WEBP. The web client also checks type and size first, for quicker feedback.
- Unknown `:kind` values return 400 (API) or 404 (web proxy).

## 6. Replacement and deletion safety

Order on replace: store the new file → switch the setting (the commit point) → archive the old file. If the upload fails, the old setting is untouched. Old files are archived (kept, not served), not deleted, so the change stays auditable. Restore-default clears the setting and archives the previous file.

## 7. Audit

Setting changes use the existing `setting.update` audit entry, with before and after values for the key and the acting user. Uploads are recorded through the existing document service.

**Not verified:** the exact content of the document-upload audit entry was not inspected.

## 8. Caching

- Login image: public `max-age=86400`, versioned by document id (`?v=`), so a replaced image is never served stale.
- Sidebar and workspace images: `private, max-age=3600`, versioned the same way. Not cached in shared caches.
- Layout fetches the appearance configuration once per render. If that fails, the default colours are used and the error is logged.

## 9. Fallbacks

No image set → default colour (`#2C3E50` for login and sidebar, `#ECF0F1` for workspace). Image fails to load → the `BackgroundImage` component renders nothing and the default shows, with no broken-image icon. A setting that points at a missing or archived document is treated as "no image".

## 10. Tests executed

| Check | Result |
|---|---|
| API `tsc --noEmit` | Pass |
| Web `tsc --noEmit` | Pass |
| API `nest build` (with `prisma generate`) | Pass |
| Web `next build` | Pass |
| Root `/` → `/login` redirect | Pass |
| `/appearance` signed-out → `/login` redirect | Pass |
| `/appearance-image/sidebar` signed-out | 401 (pass) |
| `/appearance-image/<unknown>` | 404 (pass) |
| `GET /branding/appearance` signed-out | 401 (pass) |
| `GET /branding/login/background` with none set | 404 (pass) |
| Browser: login page (26 checks: landing text absent, inline validation, no request on empty submit, show/hide password, loading state, wrong-credentials message, mobile no horizontal scroll) | 26/26 pass |

## 11. Not tested, and why

- **Valid sign-in, and everything after it**: the seeded superadmin in `.env` is rejected by the database ("Invalid email or password"). No credentials were reset or guessed. Not tested: admin upload, apply, replace, restore default, sidebar and workspace rendering after login, permission denial for a non-admin user, and API-level rejection of non-admin uploads.
- **Upload size and corrupt-file rejection through the API**: needs an authenticated admin request.
- **Collapsed sidebar**: the app has no collapsible sidebar; only a mobile drawer exists. Nothing was added.
- **Overlay intensity slider**: not implemented. The tint is fixed at 85%.
- **Upload percentage progress**: server actions do not report byte progress, so the UI shows an indeterminate state rather than a fake percentage.
- **Configuration history view**: not built. The audit log records changes; no separate history screen was added.
- **Concurrent administrator updates**: last write wins on the setting; the superseded file is archived. No optimistic locking.
- **Dark mode**: removed, because the dark overrides would contradict the five-colour palette.
- **Visual review of every module page** with the new palette: not done. The changes are token-based, but charts and dense pages were not checked in a browser.

## 12. Known limitations / external dependencies

- Authenticated appearance tests need a working administrator account in a test environment.
- Storage is the existing storage driver (local or Cloudinary). No new storage was introduced.
