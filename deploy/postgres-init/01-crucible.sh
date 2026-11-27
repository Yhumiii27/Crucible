#!/bin/sh
# First start of the compose file's own PostgreSQL (an empty volume): the database CRUCIBLE_DB_NAME (ATRIUM_PG_DB of
# deploy/compose.yaml), the role crucible_app and the schema `crucible` it owns — the layout of the suite's shared server (Matrix's base layer, docs/DEMANDES-MATRIX.md M-1/M-2), so
# that moving to the shared server changes only DATABASE_URL. Runs as the image's superuser.
set -eu
: "${CRUCIBLE_APP_PASSWORD:?CRUCIBLE_APP_PASSWORD is required}"
: "${CRUCIBLE_DB_NAME:?CRUCIBLE_DB_NAME is required}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pw="$CRUCIBLE_APP_PASSWORD" -v db="$CRUCIBLE_DB_NAME" <<'SQL'
CREATE ROLE crucible_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
CREATE DATABASE :"db";
REVOKE CREATE ON DATABASE :"db" FROM crucible_app;
GRANT CONNECT ON DATABASE :"db" TO crucible_app;
ALTER ROLE crucible_app IN DATABASE :"db" SET search_path TO crucible;
\connect :"db"
CREATE SCHEMA crucible AUTHORIZATION crucible_app;
REVOKE ALL ON SCHEMA crucible FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
