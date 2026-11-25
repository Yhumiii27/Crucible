#!/bin/sh
# Container start. By default only the web server (Docker Compose runs the migration and the worker as their own services).
# With CRUCIBLE_SINGLE_CONTAINER=on (a Coolify "Dockerfile" resource, protected by Coolify's own HTTP basic auth, like the
# suite's other tools): apply the migrations first, then run the worker in the background, then the web server.
set -e
if [ "${CRUCIBLE_SINGLE_CONTAINER:-}" = "on" ]; then
  npm run db:migrate
  npm run worker &
fi
exec node_modules/.bin/next start -H 0.0.0.0 -p 3500
