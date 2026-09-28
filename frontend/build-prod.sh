#!/usr/bin/env bash
# Build the production frontend for VPS deploy (relative /api) and make the
# committed minified bundle lint-safe by prepending /* eslint-disable */.
# Run from /app/frontend:  bash build-prod.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building (REACT_APP_BACKEND_URL='' -> relative /api)"
REACT_APP_BACKEND_URL="" GENERATE_SOURCEMAP=false yarn build

echo "==> Injecting /* eslint-disable */ into build JS (keeps linter happy)"
for f in build/static/js/*.js; do
  if ! head -c 25 "$f" | grep -q "eslint-disable"; then
    printf '/* eslint-disable */\n' | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "   patched: $f"
  fi
done
echo "==> Done. Commit and Save to Github."
