#!/bin/sh
set -e
# Create/upgrade tables (use `prisma migrate deploy` instead once you keep migration files under version control).
npx prisma db push --skip-generate
# Load demo data on first boot only.
if [ "$SEED_ON_START" = "1" ]; then SEED_FORCE=1 node dist/seed.js --if-empty; fi
exec node dist/server.js
