# Self-Hosted DB Ops

This project can run on a self-hosted PostgreSQL server without Neon.

## Installed backup shape

- Daily logical backup of only irreplaceable tables
- Full schema-only dump
- Global roles dump
- 14-day retention
- Backup root: `/var/backups/adsecute-postgres`

The daily backup intentionally excludes warehouse, raw sync, and cache tables.
Those tables are rebuilt from provider sync jobs after a restore.

## Installed health checks

- PostgreSQL readiness on `127.0.0.1:5432`
- Latest backup age
- Root disk usage
- Current database size

## Commands

Run a backup now:

```bash
systemctl start adsecute-db-core-backup.service
```

Run a health check now:

```bash
systemctl start adsecute-db-healthcheck.service
journalctl -u adsecute-db-healthcheck.service -n 20 --no-pager
```

List timers:

```bash
systemctl list-timers --all | grep adsecute-db
```

Inspect latest backup:

```bash
ls -lah /var/backups/adsecute-postgres/latest
cat /var/backups/adsecute-postgres/latest/manifest.txt
cat /var/backups/adsecute-postgres/latest/SHA256SUMS
```

## Restore outline

1. Recreate PostgreSQL and the target database.
2. Restore `globals.sql` if role state is needed.
3. Run app migrations.
4. Restore `core-data.dump` into the migrated database.
5. Restart the app and let provider sync refill warehouse tables.
