#!/usr/bin/env bash

set -euo pipefail

subject="${WEB_PUSH_VAPID_SUBJECT:-mailto:alerts@example.com}"
public_key="${WEB_PUSH_VAPID_PUBLIC_KEY:-}"
private_key="${WEB_PUSH_VAPID_PRIVATE_KEY:-}"

if [[ -z "$public_key" || -z "$private_key" ]]; then
  generated_keys="$(npx web-push generate-vapid-keys)"
  public_key="$(printf '%s\n' "$generated_keys" | awk '/Public Key:/{getline; gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit}')"
  private_key="$(printf '%s\n' "$generated_keys" | awk '/Private Key:/{getline; gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit}')"
fi

if [[ -z "$public_key" || -z "$private_key" ]]; then
  echo "Failed to generate VAPID keys." >&2
  exit 1
fi

cat <<EOF
WEB_PUSH_VAPID_SUBJECT=$subject
WEB_PUSH_VAPID_PUBLIC_KEY=$public_key
WEB_PUSH_VAPID_PRIVATE_KEY=$private_key
VITE_WEB_PUSH_PUBLIC_KEY=$public_key
EOF
