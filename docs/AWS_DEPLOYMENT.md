# Deploying Kenzo Infosystems Business Management Software on AWS

This guide takes the project from this repository to a running production
system on AWS. It covers what to create in AWS, what to change in the
project's configuration, and the exact commands to build, migrate and run it.

**Code changes needed: none.** The application already reads all its settings
from environment variables, stores every uploaded file and image in
PostgreSQL, and needs no Render- or Vercel-specific code. Deploying on AWS is
a matter of infrastructure and configuration. `render.yaml` can be deleted
once you no longer use Render.

---

## 1. What you are deploying

The repository is an npm workspaces monorepo with two applications and one
database:

| Part | Folder | Technology | Listens on |
| --- | --- | --- | --- |
| API | `backend/` | NestJS 11, Node.js 20 | `PORT` (default 4000), base path `/api/v1` |
| Web app | `frontend/` | Next.js 15 (server-rendered) | `PORT` (default 3000) |
| Database | `database/prisma/` | PostgreSQL 15+ via Prisma 6 | managed by AWS |

How the parts talk to each other:

```text
Browser ──HTTPS──▶ Web app (Next.js) ──HTTP──▶ API (NestJS) ──▶ PostgreSQL
                    public                      private          private
```

- **The browser never calls the API directly.** Every API call is made by the
  Next.js server. The API can therefore stay private: only the web app needs
  to be reachable from the internet.
- **All files live in the database.** Vendor documents, product images,
  quotation and invoice PDFs, receipts, challans, profile photos and
  appearance images are stored in PostgreSQL (`stored_files`,
  `user_profile_photos`, `brand_logo`). No S3 bucket is needed, and a database
  backup includes every file.
- **Payment reminders** run on an hourly timer inside the API process. On a
  server that is always on, nothing else is needed.

---

## 2. Recommended AWS setup

For a business application of this size, the simplest reliable setup is
**one EC2 server running both applications, plus a managed RDS PostgreSQL
database**.

| AWS service | Purpose | Suggested starting size |
| --- | --- | --- |
| **EC2** | Runs the API and the web app (PM2) behind Nginx | `t3.medium` (2 vCPU, 4 GB). `t3.small` works if you add swap; the Next.js build needs about 2 GB of memory. |
| **RDS for PostgreSQL** | Database, including all stored files | `db.t4g.small`, PostgreSQL 16, 20–50 GB gp3 storage, automated backups on |
| **Elastic IP** | Fixed public address for the server | 1 |
| **Route 53** (or your DNS provider) | `erp.yourdomain.com` → the Elastic IP | — |
| **Systems Manager Parameter Store** | Secrets (database password, auth secrets, SMTP password) | Standard parameters, `SecureString` |
| **CloudWatch** (optional) | Logs and alarms | CloudWatch agent on the EC2 server |

An alternative for higher availability (several servers, rolling deploys) is
**ECS Fargate behind an Application Load Balancer**. It needs Dockerfiles,
which are not in the repository yet. Start with EC2 and move later if you need
to; the configuration in this guide carries over unchanged.

### Region

Pick one region for EC2 and RDS (for example `ap-south-1`, Mumbai) so the API
and the database are close together.

---

## 3. Create the AWS resources

### 3.1 Network and security groups

Use the default VPC or your own. Create two security groups:

| Security group | Inbound rules |
| --- | --- |
| `kenzo-web` (EC2) | TCP 80 and 443 from `0.0.0.0/0`. SSH (22) only from your office IP, or no SSH at all if you use Session Manager. |
| `kenzo-db` (RDS) | TCP 5432 **only from the `kenzo-web` security group**. Never from the internet. |

Do **not** open ports 3000 or 4000 to the internet. Nginx is the only public
entry point, and the API is reached over `127.0.0.1`.

### 3.2 RDS PostgreSQL

1. RDS → Create database → PostgreSQL 16 → Production or Dev/Test template.
2. DB instance identifier `kenzo-erp`, master username `kenzo_admin`, a
   strong generated password (store it in Parameter Store).
3. Instance `db.t4g.small`, storage gp3 20–50 GB, storage autoscaling on.
4. **Public access: No.** VPC security group: `kenzo-db`.
5. Initial database name: `kenzo_erp`.
6. Backups: retention 7–30 days. Since files are stored in the database,
   these backups protect documents and images too.
7. Turn on deletion protection.

The connection string looks like:

```text
postgresql://kenzo_admin:PASSWORD@kenzo-erp.xxxxxxxx.ap-south-1.rds.amazonaws.com:5432/kenzo_erp?sslmode=require&connection_limit=10
```

RDS has no separate pooled endpoint, so **`DATABASE_URL` and `DIRECT_URL`
are the same string**. (If you later add RDS Proxy, point `DATABASE_URL` at
the proxy and keep `DIRECT_URL` on the instance, which migrations need.)

### 3.3 EC2 server

1. Launch an instance: **Ubuntu 24.04 LTS** (or Amazon Linux 2023),
   `t3.medium`, 30 GB gp3 disk, security group `kenzo-web`.
2. Attach an IAM role with `AmazonSSMManagedInstanceCore` (Session Manager
   access) and `CloudWatchAgentServerPolicy` (optional logging).
3. Allocate an **Elastic IP** and associate it with the instance.
4. In DNS, create an `A` record `erp.yourdomain.com` → the Elastic IP.

---

## 4. Prepare the server

Connect with Session Manager or SSH, then:

```bash
# System packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx postgresql-client

# Node.js 20 (the project is pinned to 20 via .nvmrc and package.json engines)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # must print v20.x

# PM2 keeps both apps running and restarts them on reboot
sudo npm install -g pm2

# Swap, recommended on 2–4 GB instances so the Next.js build does not run out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Application user and folder
sudo useradd --system --create-home --shell /bin/bash kenzo
sudo mkdir -p /opt/kenzo && sudo chown kenzo:kenzo /opt/kenzo
```

Check that the server can reach the database:

```bash
psql "postgresql://kenzo_admin:PASSWORD@<rds-endpoint>:5432/kenzo_erp?sslmode=require" -c "select version();"
```

---

## 5. Configuration (environment variables)

This is the main thing that changes between environments. Keep the real
values out of git. The `.env` file is already git-ignored.

### 5.1 API settings

| Variable | Required | Production value | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | Turns on the production safety checks |
| `PORT` | Yes | `4000` | The API listens here (on `127.0.0.1` behind Nginx) |
| `WEB_URL` | Yes | `https://erp.yourdomain.com` | The site's public address, no trailing slash. Used for CORS and for links in password-reset emails. |
| `DATABASE_URL` | Yes | RDS connection string | See 3.2 |
| `DIRECT_URL` | Yes | Same as `DATABASE_URL` | **Required in production**; migrations use it |
| `AUTH_ACCESS_SECRET` | Yes | 48+ random characters | Must differ from the refresh secret |
| `AUTH_REFRESH_SECRET` | Yes | 48+ random characters | |
| `AUTH_ACCESS_TTL` / `AUTH_REFRESH_TTL` | No | `15m` / `7d` | Defaults shown |
| `STORAGE_DRIVER` | No | `database` | The default. Files go to PostgreSQL. |
| `UPLOAD_MAX_BYTES` | No | `10485760` | 10 MB per upload |
| `BUSINESS_TIMEZONE` | Yes | `Asia/Kolkata` | Decides "today" for due dates and reports |
| `SMTP_HOST` | For email | e.g. `smtp.office365.com` or `smtp.gmail.com` | Quotation emails, payment reminders and password-reset emails |
| `SMTP_PORT` | For email | `587` | `465` implies TLS |
| `SMTP_SECURE` | No | `false` (587) / `true` (465) | |
| `SMTP_USER` / `SMTP_PASSWORD` | For email | Company mailbox login / app password | |
| `SMTP_FROM` | No | `jitender.saini@kenzoinfosystem.com` | The official sender (also the default) |
| `PAYMENT_ALERTS_ENABLED` | No | `true` | Hourly reminder sweep inside the API |
| `PAYMENT_ALERT_CRON_TOKEN` | No | 24+ random characters | Only needed for an external scheduler (section 9) |
| `OCR_PROVIDER` | No | `tesseract` (free, images) or `google-vision` (+ `OCR_API_KEY`) | Vendor document OCR |
| `INTERNAL_PROXY_TOKEN` | Recommended | 32+ random characters | **Same value on the web app.** Lets the API see each visitor's real IP for rate limits and audit logs. |

The seed script (first deploy only) also reads `SEED_SUPERADMIN_EMAIL`,
`SEED_SUPERADMIN_PASSWORD` (12+ characters) and `SEED_SUPERADMIN_NAME`.

**Not needed on AWS:** `CLOUDINARY_*` (files are in the database),
`STORAGE_LOCAL_ROOT`, and `API_PORT` (use `PORT`).

### 5.2 Web app settings

| Variable | Required | Production value | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | |
| `PORT` | Yes | `3000` | |
| `NEXT_PUBLIC_API_URL` | Yes | `http://127.0.0.1:4000/api/v1` | **Baked in at build time**: set it *before* `npm run web:build`, and rebuild if it changes. The API sits on the same server, so it is reached privately over `127.0.0.1`. |
| `NEXT_PUBLIC_BUSINESS_TIMEZONE` | Yes | `Asia/Kolkata` | Must match the API's `BUSINESS_TIMEZONE`; also needed at build time |
| `INTERNAL_PROXY_TOKEN` | Recommended | Same value as the API's | Server-only; never prefix it with `NEXT_PUBLIC_` |
| `TRUSTED_PROXY_HOPS` | No | `1` | Number of proxies in front of the web app: `1` for Nginx alone, `2` for an ALB plus Nginx |
| `API_TIMEOUT_MS` etc. | No | defaults | Only if the API is slow to answer |

### 5.3 Generating secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # AUTH_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # AUTH_REFRESH_SECRET (different)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # INTERNAL_PROXY_TOKEN
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # PAYMENT_ALERT_CRON_TOKEN
```

### 5.4 Where to keep the values

**Simplest:** a root-owned file `/opt/kenzo/.env.production` with
permissions `600`, loaded by PM2 (section 7).

**Better:** store each secret in **SSM Parameter Store** as a `SecureString`
under `/kenzo/prod/...`, and have the deploy script write the env file from
it. Example:

```bash
aws ssm get-parameter --name /kenzo/prod/DATABASE_URL --with-decryption --query Parameter.Value --output text
```

---

## 6. Build and set up the database

Run as the `kenzo` user (`sudo -iu kenzo`):

```bash
cd /opt/kenzo
git clone https://github.com/kenzoinfosystemDev001/Kenzo__Finance.git app
cd app
git checkout main          # deploy the reviewed production branch

# Load the production settings into this shell (see 5.4)
set -a; . /opt/kenzo/.env.production; set +a

# 1. Install exactly what package-lock.json pins, including build tools
npm ci --include=dev

# 2. Generate the Prisma client
npm run db:generate

# 3. Apply all database migrations (safe to re-run; only pending ones apply)
npm run db:deploy

# 4. First deploy only: reference data, roles, permissions and the super admin.
#    Safe to re-run: it never overwrites an existing admin's password.
npm run db:seed

# 5. Build both applications
npm run api:build
npm run web:build          # needs NEXT_PUBLIC_API_URL and NEXT_PUBLIC_BUSINESS_TIMEZONE set
```

After the first successful sign-in, **remove `SEED_SUPERADMIN_PASSWORD`** from
the env file and change the administrator's password in the app.

### Moving the existing data from Neon (if you want to keep it)

To start the AWS database with the data already in Neon, copy it before step 3:

```bash
# Dump from Neon (use the DIRECT, non-pooled URL)
pg_dump "$NEON_DIRECT_URL" --format=custom --no-owner --no-acl --file kenzo.dump

# Restore into the empty RDS database
pg_restore --dbname "$DATABASE_URL" --no-owner --no-acl --jobs 4 kenzo.dump

# Then apply any migrations newer than the dump
npm run db:deploy
```

If some older files were stored on disk or in Cloudinary rather than in the
database, copy them in once with:

```bash
npm run storage:migrate-to-db            # dry run: lists what would be copied
npm run storage:migrate-to-db -- --apply # copies, verifies checksums, never deletes originals
```

---

## 7. Run both applications with PM2

Create `/opt/kenzo/ecosystem.config.js`:

```js
// PM2 process file for Kenzo Infosystems. Both apps read /opt/kenzo/.env.production.
const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync('/opt/kenzo/.env.production', 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

module.exports = {
  apps: [
    {
      name: 'kenzo-api',
      cwd: '/opt/kenzo/app/backend',
      script: 'dist/main.js',
      env: { ...env, PORT: '4000' },
      max_memory_restart: '700M',
      time: true,
    },
    {
      name: 'kenzo-web',
      cwd: '/opt/kenzo/app/frontend',
      // npm workspaces install Next.js at the repository root.
      script: '../node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      env: { ...env, PORT: '3000' },
      max_memory_restart: '700M',
      time: true,
    },
  ],
};
```

Start the apps and make them survive reboots:

```bash
pm2 start /opt/kenzo/ecosystem.config.js
pm2 save
pm2 startup systemd -u kenzo --hp /home/kenzo   # run the command it prints, with sudo
```

Check that both are healthy:

```bash
pm2 status
curl -s http://127.0.0.1:4000/api/v1/health/ready   # {"status":"ok","database":"connected",...}
curl -sI http://127.0.0.1:3000/login | head -1      # HTTP/1.1 200 OK
```

The API binds to `0.0.0.0:PORT`. That is safe because the `kenzo-web`
security group does not open port 4000. The web app is bound to `127.0.0.1`
above.

---

## 8. Nginx and HTTPS

Create `/etc/nginx/sites-available/kenzo`:

```nginx
server {
    listen 80;
    server_name erp.yourdomain.com;

    # Uploads are capped at 10 MB by the API; leave a little headroom.
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

Only the web app is published. There is no `location` for the API: it stays
private on `127.0.0.1:4000`.

```bash
sudo ln -s /etc/nginx/sites-available/kenzo /etc/nginx/sites-enabled/kenzo
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Free TLS certificate from Let's Encrypt, auto-renewing
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.yourdomain.com --redirect
```

Open `https://erp.yourdomain.com`. The sign-in page should appear.

> **With an Application Load Balancer instead:** use an ACM certificate on the
> ALB, forward HTTPS to the instance on port 80, keep Nginx as above, and set
> `TRUSTED_PROXY_HOPS=2`.

---

## 9. Payment reminders and other background work

- **Hourly sweep:** with `PAYMENT_ALERTS_ENABLED=true` (the default), the
  API checks due dates every hour. It records reminders and emails customers
  5 days before the due date, on the due date, and every 3 days while overdue,
  until the invoice is fully paid. On an always-on EC2 server nothing more is
  needed.
- **Optional daily trigger:** if you ever run the API somewhere it can be
  stopped while idle, schedule this call (it is safe to repeat):

  ```bash
  # crontab -e (as kenzo): every day at 08:00 server time
  0 8 * * * curl -fsS -X POST -H "x-alert-token: $PAYMENT_ALERT_CRON_TOKEN" http://127.0.0.1:4000/api/v1/payment-alerts/cron > /dev/null
  ```

  The endpoint is switched off unless `PAYMENT_ALERT_CRON_TOKEN` is set (16+
  characters). On AWS you can do the same with EventBridge Scheduler.

- **Email:** outbound SMTP on port **587** works from EC2. (AWS blocks port 25
  by default; don't use it.) Use the company mailbox (Microsoft 365 or Google
  Workspace) with an app password, or Amazon SES's SMTP interface after
  verifying the `kenzoinfosystem.com` domain. Until `SMTP_HOST` is set,
  quotation emails are refused with a clear message and reminder emails wait
  up to 2 days.

---

## 10. Deploying updates

```bash
sudo -iu kenzo
cd /opt/kenzo/app
set -a; . /opt/kenzo/.env.production; set +a

git fetch origin && git checkout main && git pull --ff-only
npm ci --include=dev
npm run db:generate
npm run db:deploy          # applies only new migrations
npm run api:build
npm run web:build
pm2 reload all             # restarts with minimal downtime
curl -s http://127.0.0.1:4000/api/v1/health/ready
```

Rules for every release:

1. **CI must be green** on the branch you deploy (`.github/workflows/ci.yml`
   type-checks, tests, builds, applies every migration to an empty database
   and runs the seed twice).
2. **Merge `updates` → `main` only after review**, and deploy `main`.
3. **Read new migration files** under `database/prisma/migrations/` before
   deploying. Anything that drops or renames a column deletes data.
4. **Take a manual RDS snapshot** before a release that contains migrations
   (RDS → Snapshots → Take snapshot).

A sample `deploy.sh` with these steps can live in `/opt/kenzo/` so each
release is one command.

---

## 11. Backups and recovery

- **Automated RDS backups** (section 3.2) give point-in-time recovery for the
  retention period. Because files are stored in the database, **documents and
  images are restored together with the records that reference them**.
- **Manual snapshots** before each release with migrations.
- **Restore test:** at least once, restore a snapshot to a new RDS instance,
  point a test server at it and sign in, to prove the backups work.
- **Storage growth:** each file adds its size to the database (uploads are
  capped at 10 MB). Watch `FreeStorageSpace` in CloudWatch and keep storage
  autoscaling on.

---

## 12. Monitoring

| What | How |
| --- | --- |
| App logs | `pm2 logs`, or install the CloudWatch agent and ship `~/.pm2/logs/*.log` |
| API health | `GET /api/v1/health/ready` (checks the database). Monitor it from an uptime checker or a CloudWatch Synthetics canary through the site. |
| Server | CloudWatch alarms on EC2 `CPUUtilization` > 80% and `StatusCheckFailed` |
| Database | CloudWatch alarms on RDS `CPUUtilization`, `FreeStorageSpace`, `DatabaseConnections` |
| Errors | `pm2 logs kenzo-api --err`. Errors are logged without internal details reaching users. |

---

## 13. Security checklist

- [ ] RDS is **not publicly accessible**; its security group allows only the EC2 security group.
- [ ] Ports 3000 and 4000 are **not** open to the internet; only 80/443 are.
- [ ] SSH is restricted to your IP, or replaced by Session Manager.
- [ ] HTTPS is on (certbot or ACM), HTTP redirects to HTTPS.
- [ ] `NODE_ENV=production` on both apps (it enables the strict checks and HSTS).
- [ ] `AUTH_ACCESS_SECRET` and `AUTH_REFRESH_SECRET` are random, different, and not the `.env.example` placeholders (the API refuses to start otherwise).
- [ ] `INTERNAL_PROXY_TOKEN` is set to the **same** 32+ character value on both apps.
- [ ] `SEED_SUPERADMIN_PASSWORD` was removed after the first sign-in.
- [ ] Secrets live in Parameter Store or a `600`-permission file, never in git.
- [ ] RDS automated backups and deletion protection are on.
- [ ] OS security updates: `sudo apt install unattended-upgrades`.
- [ ] Pending dependency upgrades from the security review are planned:
      **nodemailer 10.x** (email), **Next.js 16** and **zod 4**. Test each
      separately before production.

---

## 14. Summary: what changes compared with Render/Vercel

| Area | Render + Vercel (before) | AWS (now) |
| --- | --- | --- |
| API hosting | Render web service (sleeps when idle on the free plan) | PM2 on EC2, always on |
| Web hosting | Vercel | PM2 on the same EC2, behind Nginx |
| API exposure | Public URL | Private, `127.0.0.1:4000` |
| `NEXT_PUBLIC_API_URL` | `https://<render-service>.onrender.com/api/v1` | `http://127.0.0.1:4000/api/v1` |
| Database | Neon | RDS PostgreSQL (`DATABASE_URL` = `DIRECT_URL`) |
| File storage | Cloudinary / local disk | PostgreSQL (`STORAGE_DRIVER=database`, the default) |
| TLS | Provided by Render/Vercel | Let's Encrypt (certbot) or ACM on an ALB |
| Payment reminders | Needed an external cron while the server slept | Built-in hourly timer; external trigger optional |
| Client IP for rate limits/audit | Not forwarded | `INTERNAL_PROXY_TOKEN` + `TRUSTED_PROXY_HOPS` |
| Secrets | Render/Vercel dashboards | SSM Parameter Store or a protected env file |
| `render.yaml` | Used | Not used; can be deleted |

---

## 15. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| API exits at start with "Invalid environment configuration" | A required variable is missing or malformed; the message names it. In production `DIRECT_URL` is required and the auth secrets must not be placeholders. |
| Sign-in page shows "temporarily unavailable" | The web app cannot reach the API. Check `pm2 status`, `curl http://127.0.0.1:4000/api/v1/health/ready`, and that `NEXT_PUBLIC_API_URL` was set **before** `npm run web:build`. |
| `P1001: Can't reach database server` | RDS security group does not allow the EC2 security group, or the URL is wrong. Test with `psql` (section 4). |
| Build stops with "JavaScript heap out of memory" | Add swap (section 4) or use a larger instance for the build. |
| Uploads fail with 413 | Raise `client_max_body_size` in Nginx (keep it above 10 MB). |
| Quotation email says sending is not configured | Set `SMTP_HOST` (and user/password) and `pm2 reload kenzo-api`. |
| Audit logs show `127.0.0.1` for every user | Set the same `INTERNAL_PROXY_TOKEN` on both apps and check `TRUSTED_PROXY_HOPS`. |
| Password-reset links point to the wrong site | `WEB_URL` must be the public `https://` address. |
