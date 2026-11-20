# Deployment Guide

**Frontend:** Vercel (Next.js) · **Backend:** Render (NestJS) · **Database:** Neon (PostgreSQL)

Deploy the **backend first**. The frontend needs the backend's public URL, and
the backend needs the frontend's public URL for CORS, so there is one
chicken-and-egg step handled in section 5.

---

## 1. Before you start

Rotate anything that has been shared or pasted anywhere:

```bash
# Generate each auth secret separately - they must differ
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Never reuse the development `DATABASE_URL`, secrets, or admin password in
production. Create a **separate Neon database** (or at least a separate branch)
for production so test data can never reach real records.

---

## 2. Backend on Render

### Service settings

| Setting | Value |
| --- | --- |
| Type | Web Service |
| Repository | `kenzoinfosystemDev001/Kenzo__Finance` |
| Branch | `main` |
| Root Directory | *(blank, or `apps/api` — both work)* |
| Runtime | Node |
| Build Command | `npm install && npm run render:build` |
| Start Command | `npm run render:start` |
| Health Check Path | `/api/v1/health/ready` |

The Build Command installs; `render:build` then applies migrations,
generates the Prisma client and compiles. `render:start` runs the compiled
server.

**The same two commands work from either Root Directory**, because both
`package.json` and `apps/api/package.json` define `render:build` and
`render:start`. Render resolves a script relative to the Root Directory, so
a root-only script reports `Missing script: "render:build"` when the Root
Directory is `apps/api` — the duplication exists to make that impossible.

Verified from both directories:

```
Root Directory = (blank)      npm install && npm run render:build   -> exit 0
Root Directory = apps/api     npm install && npm run render:build   -> exit 0
```

> Do not put `npm install` *inside* `render:build`. Run from within a
> workspace package, npm 10 fails with
> `Cannot read properties of null (reading 'location')`. Installing belongs
> in the Build Command, where Render puts it by default.

> Render injects `PORT` and requires the process to bind to it on `0.0.0.0`.
> The app reads `PORT` first and falls back to `API_PORT` locally, so you do
> **not** set `API_PORT` on Render.

### Backend environment variables

Set these in **Render → your service → Environment**.

| Variable | Required | Value / example | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | Enables secure cookies, disables Swagger |
| `DATABASE_URL` | Yes | `postgresql://USER:PASS@ep-xxx-pooler.REGION.aws.neon.tech/DB?sslmode=require` | **Pooled** host (contains `-pooler`) |
| `DIRECT_URL` | Yes | `postgresql://USER:PASS@ep-xxx.REGION.aws.neon.tech/DB?sslmode=require` | **Direct** host (no `-pooler`); migrations only |
| `WEB_URL` | Yes | `https://your-app.vercel.app` | CORS origin. **No trailing slash** |
| `AUTH_ACCESS_SECRET` | Yes | 96-char hex | Min 32 chars |
| `AUTH_REFRESH_SECRET` | Yes | 96-char hex | Min 32 chars, **must differ** from the access secret |
| `AUTH_ACCESS_TTL` | No | `15m` | Default `15m` |
| `AUTH_REFRESH_TTL` | No | `7d` | Default `7d` |
| `STORAGE_DRIVER` | Yes | `cloudinary` | `local` needs a persistent disk; `cloudinary` does not |
| `CLOUDINARY_CLOUD_NAME` | If cloudinary | `your-cloud-name` | Or supply `CLOUDINARY_URL` instead |
| `CLOUDINARY_API_KEY` | If cloudinary | `1234...` | |
| `CLOUDINARY_API_SECRET` | If cloudinary | secret | **Never** expose to the frontend |
| `CLOUDINARY_URL` | Alternative | `cloudinary://key:secret@cloud` | Replaces the three values above |
| `CLOUDINARY_FOLDER` | No | `kenzo-erp` | Folder prefix inside Cloudinary |
| `STORAGE_LOCAL_ROOT` | If local | `/var/data/storage` | Only when `STORAGE_DRIVER=local` |
| `UPLOAD_MAX_BYTES` | No | `10485760` | 10 MB default |
| `OCR_PROVIDER` | No | `stub` | `stub` or `google-vision`; the latter requires `OCR_API_KEY` |
| `OCR_API_KEY` | If google-vision | Google Cloud Vision API key | Startup fails without it when `OCR_PROVIDER=google-vision` |
| `SEED_SUPERADMIN_EMAIL` | First deploy | `admin@kenzoinfosystems.com` | Used once by the seed |
| `SEED_SUPERADMIN_PASSWORD` | First deploy | strong, 12+ chars | **Remove after seeding** |
| `SEED_SUPERADMIN_NAME` | No | `System Administrator` | |

Do **not** set `PORT` — Render provides it. Do **not** set `API_PORT`.

### Uploaded files: use Cloudinary on Render

Render's filesystem is **ephemeral** — everything written is destroyed on each
deploy and restart. With `STORAGE_DRIVER=local` that silently deletes every
uploaded vendor document, OCR source file and product image, while the
database keeps rows pointing at files that no longer exist. The API logs a
warning at startup when it detects this.

**Recommended: Cloudinary.** Set these on Render:

```
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
```

or the single-variable form:

```
STORAGE_DRIVER=cloudinary
CLOUDINARY_URL=cloudinary://key:secret@cloud-name
```

Two things worth knowing about how this is wired:

- Assets upload as **`type: authenticated`**, not public. A default Cloudinary
  upload is readable by anyone holding the URL, which is wrong for vendor GST
  certificates and PAN documents.
- Downloads still stream through the permission-checked API endpoint rather
  than handing the browser a signed URL. That keeps one enforcement point,
  preserves the download audit entry, and means a URL cannot leak and outlive
  the user's access.

Startup fails fast with a clear message when `STORAGE_DRIVER=cloudinary` but
the credentials are missing, rather than failing on the first upload.

**Alternative: a Render persistent disk** (paid plans only). Render → your
service → **Disks** → *Add Disk*, mount path `/var/data`, then set
`STORAGE_DRIVER=local` and `STORAGE_LOCAL_ROOT=/var/data/storage`.

### Seeding the production database

`render:build` runs the seed on every deploy, after the migrations. It
creates permissions, roles, document sequences, vendor and product
categories, and the one administrator. It creates **no** sample business data
and only ever adds what is missing: it never resets a sequence, never edits an
existing category, and never overwrites an existing admin password. Running it
on each deploy is what gives roles any permission codes a new release adds
(for example the `quotation.*` codes), and a fresh database its document
sequences, without a manual step.

If the service was created by hand rather than from the Blueprint, make sure
its build command is `npm install && npm run render:build`. To run the seed
manually instead, open **Render → Shell** and run `npm run db:seed`.

Then **delete `SEED_SUPERADMIN_PASSWORD`** from the environment and change the
password in the app.

---

## 3. Frontend on Vercel

### Project settings

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Build Command | *(default)* `next build` |
| Install Command | *(default)* |
| Node Version | 20.x |

Because the Root Directory is `apps/web`, Vercel installs and builds only the
frontend. The frontend has no Prisma or database dependency.

### Frontend environment variables

| Variable | Required | Value | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://your-api.onrender.com/api/v1` | Must include `/api/v1`. **No trailing slash** |
| `API_TIMEOUT_MS` | No | `8000` | How long a page render waits for the API |
| `API_LOGIN_TIMEOUT_MS` | No | `20000` | Longer: a sign-in may need to wake the backend |
| `API_UPLOAD_TIMEOUT_MS` | No | `60000` | Uploads legitimately take longer |
| `NODE_ENV` | No | set by Vercel | Do not set manually |

`NEXT_PUBLIC_API_URL` is the **only** variable the frontend requires; the
three timeouts have working defaults and exist for hosts with unusual request
limits. Raising a timeout above the platform's own limit achieves nothing —
the platform kills the request first and serves its error instead of ours.

> `NEXT_PUBLIC_` values are read when the app is **built**, not when it runs.
> Saving one in the Vercel dashboard changes nothing until you redeploy.

**It must not receive any secret.** No `DATABASE_URL`, no `AUTH_*` secret, no
admin password. The frontend never talks to the database and never signs a
token; it calls the API over HTTPS and stores the session in httpOnly cookies
set by its own server.

> `NEXT_PUBLIC_` variables are embedded in the browser bundle and are public by
> definition. `NEXT_PUBLIC_API_URL` is fine — it is just a URL. Never prefix a
> secret with `NEXT_PUBLIC_`.

Set it for **Production**, **Preview** and **Development** if you want preview
deployments to work.

---

## 4. Which variable goes where — summary

| Variable | Render (API) | Vercel (web) |
| --- | :---: | :---: |
| `DATABASE_URL` | ✅ | ❌ never |
| `DIRECT_URL` | ✅ | ❌ never |
| `AUTH_ACCESS_SECRET` | ✅ | ❌ never |
| `AUTH_REFRESH_SECRET` | ✅ | ❌ never |
| `SEED_SUPERADMIN_*` | ✅ (first deploy) | ❌ never |
| `STORAGE_*`, `CLOUDINARY_*`, `UPLOAD_MAX_BYTES`, `OCR_*` | ✅ | ❌ never |
| `WEB_URL` | ✅ (the Vercel URL) | ❌ |
| `NEXT_PUBLIC_API_URL` | ❌ | ✅ (the Render URL) |
| `NODE_ENV=production` | ✅ | set by Vercel |
| `PORT` | provided by Render | provided by Vercel |

The two cross-references are the part people get wrong:

- **Render's `WEB_URL`** points at **Vercel**
- **Vercel's `NEXT_PUBLIC_API_URL`** points at **Render**

---

## 5. Deployment order

1. Deploy the API to Render with `WEB_URL` set to a placeholder such as
   `https://example.com` (it must be a valid URL or startup validation fails).
2. Copy the Render URL, e.g. `https://kenzo-erp-api.onrender.com`.
3. Deploy the frontend to Vercel with
   `NEXT_PUBLIC_API_URL=https://kenzo-erp-api.onrender.com/api/v1`.
4. Copy the Vercel URL, e.g. `https://kenzo-erp.vercel.app`.
5. Go back to Render, set `WEB_URL` to the Vercel URL, and redeploy.
6. Run `npm run db:seed` in the Render shell, then remove
   `SEED_SUPERADMIN_PASSWORD`.
7. Sign in and change the administrator password.

---

## 6. Verifying the deployment

```bash
# API is alive and can reach Neon
curl https://your-api.onrender.com/api/v1/health/ready
# -> {"status":"ok","database":"connected", ...}

# Unauthenticated access is refused
curl -o /dev/null -w "%{http_code}\n" https://your-api.onrender.com/api/v1/vendors
# -> 401
```

### Is the frontend actually talking to the backend?

Curling the API from your laptop proves the API is up. It proves nothing
about what the **Vercel server** can reach — different network, different
environment variables, and `NEXT_PUBLIC_API_URL` was fixed when the site was
built, not when you curled it. The frontend answers that itself:

```bash
curl https://your-site.vercel.app/api/health
```

```jsonc
// connected
{ "web": "ok", "api": "ok", "apiUrl": "https://...onrender.com/api/v1",
  "latencyMs": 412, "database": "connected" }
```

`database: "connected"` is the useful part — it proves the chain reaches
PostgreSQL, not just that something is listening. Anything else names the
problem:

| `api` | Means |
| --- | --- |
| `not-configured` | `NEXT_PUBLIC_API_URL` was unset **at build time** — set it and redeploy |
| `unreachable` | Wrong host name, or the service is not running |
| `timeout` | No answer in 10s — usually a free instance waking; retry once |
| `unhealthy` + `httpStatus: 404` | Reached the host but not the API — the URL is missing `/api/v1` |
| `unhealthy` + other status | The API answered but is unwell — read its own log |

It returns HTTP 200 only when fully connected, so it also works as an uptime
check. It exposes nothing private: the API URL already ships to every
browser in `NEXT_PUBLIC_API_URL`.

Then open the Vercel URL and sign in. If the frontend shows
*"The service is temporarily unavailable"*, the cause is one of:

| Symptom | Cause |
| --- | --- |
| Error page on every route | `NEXT_PUBLIC_API_URL` is wrong, or missing `/api/v1` |
| Login fails but health is OK | `WEB_URL` on Render does not exactly match the Vercel origin (CORS) |
| First request after idle fails | Render free tier cold start; the API retries the database automatically |
| Works then logs out | `AUTH_*` secrets changed between deploys, invalidating issued tokens |

### `Application error: a server-side exception has occurred` + a digest

The hosting platform's own error page, shown when a Server Component throws
and nothing catches it. The real message is stripped in production, leaving
only the digest — which is the key to the matching entry in the Vercel
function log, so quote it when you look there.

If `/` loads but `/login` does not, the fault is in the API call: the landing
page makes none. The usual cause was an upstream `502`/`503`/`504` from a
backend that was deploying, restart-looping or asleep — those are now
reported as "service unavailable" with a retry, and `/api/health` names the
underlying problem. A root error boundary catches whatever is left, so this
platform page should no longer be reachable.


### Build fails: "Property 'xyz' does not exist on type 'PrismaClient'"

Typical lines, often dozens at once:

```
error TS2551: Property 'vendorProductModel' does not exist on type
  'Omit<PrismaClient, ...>'. Did you mean 'vendorProduct'?
error TS2339: Property 'status' does not exist on type '{ id: string; ... }'
error TS7006: Parameter 'm' implicitly has an 'any' type
```

**Cause: the generated Prisma client is older than the schema.** It is not
committed — it is generated into `node_modules`, so it has to be rebuilt
whenever `schema.prisma` changes. Render restores `node_modules` from its
build cache and `npm install` then reports "up to date", which means
`@prisma/client`'s own postinstall never runs. A build command of just
`nest build` therefore compiles new code against last week's client.

The knock-on errors are the confusing part: once Prisma cannot type one
model, `include`/`select` inference collapses and perfectly good code starts
reporting missing properties and implicit `any`. **Fix the client and they all
disappear together** — do not "fix" them individually.

`apps/api`'s `build` script is now `prisma generate && nest build`, so this
cannot recur regardless of build command, Root Directory or cache state.

The same thing happens locally after pulling a branch that changed the
schema. On Windows, `prisma generate` fails with `EPERM ... query_engine-
windows.dll.node` while the API is running, because the live process holds
the engine mapped — **stop the API first**, then build.

### Deploy fails with "No open ports detected" / exit 134

The full symptom in the Render log is:

```
==> Running 'npm start'
> nest start
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
==> No open ports detected, continuing to scan...
==> Exited with status 134
```

**Cause: the service is starting with `nest start`, which is the development
command.** It compiles the whole TypeScript project in-process on every boot.
That needs far more memory than a 512 MB free instance has, so Node aborts
(exit 134 = SIGABRT) before `app.listen()` ever runs — which is why Render
then reports that no port was opened. The port binding was never the problem.

**Fix:** the start command must run the already-compiled output. Set the
service to the values in *Service settings* above (`npm run render:start`).
`apps/api`'s own `start` script is also `node dist/main.js` now, so a plain
`npm start` is correct whichever directory Render runs it from — `nest start`
is no longer reachable by accident.

| Command | What it does | Use for |
| --- | --- | --- |
| `nest start` | Compiles, then runs. High memory | Nothing — use `start:dev` locally |
| `nest start --watch` | Compiles and recompiles on change | Local development |
| `node dist/main.js` | Runs the compiled server. Low memory | **Production** |

> **Migrations are the one thing a bare `npm run build` still misses.** The
> build generates the Prisma client and compiles, but deliberately does not
> touch the database — a build should not mutate a live schema, and it would
> fail whenever Neon happened to be asleep. Use
> `npm install && npm run render:build`, which runs `migrate deploy` first.

### Starts then exits: `STORAGE_DRIVER=cloudinary requires either...`

The build succeeds and the container restart-loops. The startup check reports
what it found, which is usually the answer:

```
STORAGE_DRIVER=cloudinary requires either CLOUDINARY_URL, or all of
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.
  Recognised and set: CLOUDINARY_API_KEY
  Set but NOT read by this application: CLOUD_NAME, CLOUDINRY_URL
  -> These look like Cloudinary variables under the wrong name.
```

Three mistakes account for nearly every occurrence:

| Mistake | Looks like | Fix |
| --- | --- | --- |
| Shortened name | `CLOUD_NAME` | `CLOUDINARY_CLOUD_NAME` |
| Misspelling | `CLOUDINRY_URL` | `CLOUDINARY_URL` |
| Key pasted into the value | `CLOUDINARY_URL=cloudinary://...` | value is **only** `cloudinary://...` |

The last one is now repaired automatically, along with wrapping quotes, but
the variable still has to be named correctly — nothing can rescue a name the
application never reads.

**Simplest working setup is one variable:**

```
STORAGE_DRIVER=cloudinary
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
```

Delete `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET` if you use the URL — it already contains all three.
Find it in Cloudinary under **Dashboard → API Keys → API environment
variable**; copy the part from `cloudinary://` onwards.

### Build fails: `Missing script: "render:build"`

```
npm error workspace @kenzo-erp/api@0.1.0
npm error location /opt/render/project/src/apps/api
npm error Missing script: "render:build"
```

The `location` line tells you the Root Directory Render is using. The script
exists in the root `package.json`, but npm only sees the one belonging to the
directory it is run from. Both files now define it, so this is fixed — but
the same log line is how you confirm the Root Directory whenever a command
behaves unexpectedly.

### The site loads but sign-in shows "temporarily unavailable"

The landing page at `/` is fully static and never calls the API, so if the
home page renders and `/login` does not, the backend is the problem, not the
frontend deploy.

Check in this order:

1. `curl https://your-api.onrender.com/api/v1/health/ready` — if this fails,
   fix the API first.
2. If the error page says *"This deployment has no backend address
   configured"*, `NEXT_PUBLIC_API_URL` is missing on Vercel. It is read at
   **build** time, so setting it is not enough — **redeploy** afterwards.
3. Otherwise it is a cold start. The web app waits 8s for a page render and
   20s for a sign-in before giving up, deliberately less than the hosting
   platform's own request limit so you get our retry page rather than a raw
   504 from Vercel.

---

## 7. Known production limitations

These are honest gaps, not bugs:

- **Ephemeral storage** unless `STORAGE_DRIVER=cloudinary` or a persistent disk is mounted (section 2).
- **Render free tier spins down** after inactivity; the first request can take
  ~30–60s. Neon also auto-suspends; the API retries with backoff rather than
  crashing, but the first call is slow.
- **No email provider** is wired up yet — that arrives with the quotation
  module.
- **OCR is the stub provider.** It genuinely extracts from text files but
  returns an empty draft for scanned PDFs and images rather than inventing
  values. Swap in a real provider by implementing `OcrProvider`.
- **No rate limiting beyond the in-process throttler**, which resets on each
  restart and is per-instance. Fine for one instance; use a shared store if
  you scale out.
