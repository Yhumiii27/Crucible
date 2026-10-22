#!/bin/sh
# First start of the compose file's own PostgreSQL (an empty volume): the database `epc2i`, the role crucible_app and the
# schema `crucible` it owns — the layout of the shared EPC2I server (Matrix's base layer, docs/DEMANDES-MATRIX.md M-1/M-2), so
# that moving to the shared server changes only DATABASE_URL. Runs as the image's superuser.
set -eu
: "${CRUCIBLE_APP_PASSWORD:?CRUCIBLE_APP_PASSWORD is required}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pw="$CRUCIBLE_APP_PASSWORD" <<'SQL'
CREATE ROLE crucible_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
CREATE DATABASE epc2i;
REVOKE CREATE ON DATABASE epc2i FROM crucible_app;
GRANT CONNECT ON DATABASE epc2i TO crucible_app;
ALTER ROLE crucible_app IN DATABASE epc2i SET search_path TO crucible;
\connect epc2i
CREATE SCHEMA crucible AUTHORIZATION crucible_app;
REVOKE ALL ON SCHEMA crucible FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
