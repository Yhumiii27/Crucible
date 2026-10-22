# Crucible — one image for the web server and the deploy-time migration (derived from Keystone's, R-003). Runbook:
# docs/EXPLOITATION.md (French).
#   web server : the default command (next start on port 3500)
#   migration  : npm run db:migrate   (before the new version starts; CRUCIBLE_SEED explicit on an empty schema)
#   job worker : npm run worker       (backups when CRUCIBLE_BACKUP_DIR is set, daily declaration to Matrix)
#   backups    : npm run backup / npm run restore -- <file> --yes (pg_dump / pg_restore 16 are installed below)
# Crucible runs on PostgreSQL only: DATABASE_URL is a runtime variable (the shared EPC2I server, schema `crucible`, role crucible_app).
# Coolify: deploy/compose.yaml.
FROM node:22-bookworm-slim

# PostgreSQL 16 client tools for the backups (Debian bookworm ships 15, which cannot dump a 16 server); curl stays: Coolify's
# own health check (enabled in its UI) needs curl or wget in the image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
# Development dependencies are kept on purpose: tsx runs db:migrate, the worker, backup and restore.
RUN npm ci --no-audit

COPY . .

# Public URLs of the sibling apps, inlined in the browser bundles by `next build`: the ONLY build arguments (Coolify:
# variables marked "Available at build time"). Left empty they are unset, so the links keep their localhost defaults.
ARG NEXT_PUBLIC_KEYSTONE_URL
ARG NEXT_PUBLIC_CODEX_URL
ARG NEXT_PUBLIC_VIGIE_URL
RUN if [ -z "$NEXT_PUBLIC_KEYSTONE_URL" ]; then unset NEXT_PUBLIC_KEYSTONE_URL; fi; \
    if [ -z "$NEXT_PUBLIC_CODEX_URL" ]; then unset NEXT_PUBLIC_CODEX_URL; fi; \
    if [ -z "$NEXT_PUBLIC_VIGIE_URL" ]; then unset NEXT_PUBLIC_VIGIE_URL; fi; \
    npm run build

ENV NODE_ENV=production \
    CRUCIBLE_DATA_DIR=/data \
    TZ=Europe/Paris \
    LOG_FORMAT=json \
    PORT=3500 \
    HOSTNAME=0.0.0.0

RUN mkdir -p /data /backups && chown node:node /data /backups && chown -R node:node /app/.next
USER node

EXPOSE 3500
# GET /api/health: 200 when the database answers and has no pending migration.
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3500/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3500"]
