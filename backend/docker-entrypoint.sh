#!/bin/sh
set -e
npx prisma db push --skip-generate
if [ "$SEED" = "true" ]; then npx ts-node prisma/seed.ts || true; fi
exec node dist/main
