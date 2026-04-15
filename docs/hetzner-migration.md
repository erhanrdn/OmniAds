# Hetzner Deployment

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
- Set explicit runtime contract flags in `.env.production`:
  - `META_AUTHORITATIVE_FINALIZATION_V2`
  - `META_RETENTION_EXECUTION_ENABLED`
  - `SYNC_DEPLOY_GATE_MODE`
  - `SYNC_RELEASE_GATE_MODE`
  - `SYNC_RELEASE_CANARY_BUSINESSES`
- `SYNC_RELEASE_CANARY_BUSINESSES` is the release-gate canary set and must include `TheSwaf` during Meta stabilization.
- `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES` is legacy-only and no longer controls the live global finalization contract.
- Keep your existing database values unless you are also migrating the database away from Neon.

## 3. Pull and run the containers

```bash
export APP_IMAGE_TAG=<exact-commit-sha>
export APP_BUILD_ID=<exact-commit-sha>
docker compose pull web worker migrate
docker compose run --rm --no-deps migrate
docker compose up -d --force-recreate web worker
docker compose logs -f web
docker compose logs -f worker
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q web)"
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q worker)"
npm run sync:worker-health -- --provider-scope meta --online-window-minutes 5
node --import tsx scripts/sync-gate-evaluate.ts --gate deploy_gate --enforce
node --import tsx scripts/sync-gate-evaluate.ts --gate release_gate
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

## 5. Re-create app cron jobs

The app expects:

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
- `http://127.0.0.1:3000/api/build-info`
- login/session flow
- database-backed pages
- OAuth reconnect flows
- background worker logs
- cron logs
- Shopify and other webhooks

## 8. Optional: auto-deploy from GitHub

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-hetzner.yml`.

Manual break-glass is allowed only through `workflow_dispatch` with:

- `break_glass=true`
- `override_reason=<explicit operator reason>`

That path records a break-glass verdict row and does not hide `not_release_ready`.

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

- The server does not need Git access to the repository.
- The deploy workflow does not run `git fetch` or `git reset --hard origin/main`.
- The deploy workflow does not build on the server. CI builds exact-SHA images, pushes them to GHCR, and production only pulls them.
- Pushes to `main` trigger CI first, then deploy the exact `workflow_run.head_sha` after CI succeeds.
- Manual rollback uses the same deploy workflow with a required `sha` input. Do not use `main`, `latest`, or branch names for manual deploys.

## Notes specific to this repo

- The worker is important. If `npm run worker:start` is not running, sync jobs can silently stall.
- The deploy workflow validates the running release by checking `/api/build-info` and matching `buildId` to the deployed SHA.
- For Meta authoritative finalization rollout, use three stages:
  1. shadow mode: deploy with `META_AUTHORITATIVE_FINALIZATION_V2=0`
  2. allowlisted canary: `META_AUTHORITATIVE_FINALIZATION_V2=1` with `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES=<businessId>`
  3. full rollout: clear `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES` after canary and `T0 + 24h` validation pass
- The app uses `NEXT_PUBLIC_APP_URL` in multiple OAuth and metadata paths, so set it before going live.
- Runtime migrations are guarded by `ENABLE_RUNTIME_MIGRATIONS`. Leave it disabled unless you explicitly want app boot to run migrations.
- `docker-compose.yml` is production-only and image-based. Use `docker-compose.dev.yml` for local build-based development.
