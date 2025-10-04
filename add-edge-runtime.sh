#!/bin/bash

# Add edge runtime export to API routes that need it
routes=(
  "pages/api/admin/re-encrypt-credentials.js"
  "pages/api/auth/login.js"
  "pages/api/auth/signup.js"
  "pages/api/cantaloupe/auth.js"
  "pages/api/devices/[id].js"
  "pages/api/devices/capture.js"
  "pages/api/devices/index.js"
  "pages/api/dex/capture.js"
  "pages/api/dex/collect-bulk.js"
  "pages/api/dex/collect.js"
  "pages/api/dex/list-only.js"
  "pages/api/dex/parsed-summary.js"
  "pages/api/dex/scheduler.js"
  "pages/api/dex/summary.js"
  "pages/api/machines/[caseSerial]/details.js"
  "pages/api/machines/action-error.js"
  "pages/api/machines/summary.js"
  "pages/api/user/dex-credentials.js"
  "pages/api/user/profile.js"
  "pages/api/user/test-dex-connection.js"
  "pages/api/user/update-credentials-metadata.js"
)

for route in "${routes[@]}"; do
  if [ -f "$route" ]; then
    # Check if it already has the runtime export
    if ! grep -q "export const runtime" "$route"; then
      # Add after the first import line
      sed -i.bak '1a\
export const runtime = '\''edge'\''\
' "$route"
      rm "${route}.bak"
      echo "Added edge runtime to $route"
    fi
  fi
done
