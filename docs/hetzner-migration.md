# Vercel to Hetzner Migration

This project can run on Hetzner with four clear responsibilities:

1. `web`: serves the Next.js app
2. `worker`: runs the durable sync worker
3. `cron`: triggers internal cron endpoints
4. `nginx`: terminates HTTP/HTTPS and forwards traffic to the app

## 1. Prepare the server

Install Docker, Docker Compose plugin, Nginx, and Certbot on the Hetzner host.

Example on Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker
```

## 2. Copy environment variables

Create `.env.production` on the server from `.env.production.example`.

Important:

- Set `NEXT_PUBLIC_APP_URL` to the final production domain.
- Add `CRON_SECRET`.
- Keep your existing database values unless you are also migrating the database away from Neon.
- `VERCEL_OIDC_TOKEN` is Vercel-specific and is not needed on Hetzner.

## 3. Build and run the containers

```bash
docker compose build
docker compose up -d
docker compose logs -f web
docker compose logs -f worker
```

The app listens internally on `127.0.0.1:3000`.

## 4. Put Nginx in front

Copy `deploy/nginx/adsecute.conf` to `/etc/nginx/sites-available/adsecute` and update the domain.

```bash
sudo ln -s /etc/nginx/sites-available/adsecute /etc/nginx/sites-enabled/adsecute
sudo nginx -t
sudo systemctl reload nginx
```

Then issue TLS certificates:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 5. Re-create Vercel cron jobs

Vercel currently calls:

- `/api/sync/cron` every 10 minutes
- `/api/ai/cron` every day at 04:00

Add host-level cron entries:

```bash
crontab -e
```

```cron
*/10 * * * * curl -fsS -X POST http://127.0.0.1:3000/api/sync/cron -H "Authorization: Bearer YOUR_CRON_SECRET" >/tmp/adsecute-sync-cron.log 2>&1
0 4 * * * curl -fsS -X POST http://127.0.0.1:3000/api/ai/cron -H "Authorization: Bearer YOUR_CRON_SECRET" >/tmp/adsecute-ai-cron.log 2>&1
```

If you want the jobs to run on Turkey time, make sure the server timezone matches your target timezone:

```bash
timedatectl
sudo timedatectl set-timezone Europe/Istanbul
```

## 6. Update third-party provider settings

Because the host changes, verify all callback and app URLs:

- Google Ads OAuth redirect URI
- Google Analytics redirect URI
- Google Sign-In redirect URI
- Facebook sign-in redirect URI
- Shopify app URL and redirect URI

These must match the public Hetzner domain exactly.

## 7. Smoke test after cutover

Check:

- `https://your-domain.com/login`
- login/session flow
- database-backed pages
- OAuth reconnect flows
- background worker logs
- cron logs
- Shopify and other webhooks

## 8. Optional: auto-deploy from GitHub

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-hetzner.yml`.

Add these repository secrets in GitHub:

- `HETZNER_HOST`: your server IP, for example `178.156.222.119`
- `HETZNER_USER`: SSH user, for example `root`
- `HETZNER_PORT`: optional, default `22`
- `HETZNER_SSH_KEY`: the private SSH key GitHub Actions should use to reach the server
- `HETZNER_KNOWN_HOSTS`: output of `ssh-keyscan -H your-domain-or-ip`

Example for `HETZNER_KNOWN_HOSTS`:

```bash
ssh-keyscan -H 178.156.222.119
```

Important:

- The server itself still needs GitHub read access so `git fetch` works on the box.
- The workflow does a `git reset --hard origin/main`, so only use it if the server worktree should always match GitHub.
- Pushes to `main` will trigger a deploy automatically.

## Notes specific to this repo

- The worker is important. If `npm run worker:start` is not running, sync jobs can silently stall.
- The app uses `NEXT_PUBLIC_APP_URL` in multiple OAuth and metadata paths, so set it before going live.
- Runtime migrations are guarded by `ENABLE_RUNTIME_MIGRATIONS`. Leave it disabled unless you explicitly want app boot to run migrations.
