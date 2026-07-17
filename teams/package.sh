#!/usr/bin/env bash
# Build the Teams app package.
#
#   ./package.sh my-tunnel-abc123.devtunnels.ms
#
# Teams only loads a tab over HTTPS, so during development you point this at the
# public hostname of your tunnel (dev tunnel, ngrok, whatever forwards to :3978).
# In production it is the hostname of your App Service. The manifest ships with a
# __TAB_DOMAIN__ placeholder precisely so no one accidentally commits their tunnel.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: ./package.sh <hostname>   (no scheme, no trailing slash)" >&2
  exit 1
fi
if [[ "$DOMAIN" == http* || "$DOMAIN" == */* ]]; then
  echo "error: pass a bare hostname, e.g. contoso.example.com" >&2
  exit 1
fi

cd "$(dirname "$0")"
OUT="foundry-agent-tab.zip"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

sed "s|__TAB_DOMAIN__|${DOMAIN}|g" manifest.json > "$WORK/manifest.json"
cp color.png outline.png "$WORK/"

# The zip must have manifest.json at the root — not inside a folder.
( cd "$WORK" && zip -q -r "$OLDPWD/$OUT" manifest.json color.png outline.png )

echo "Built $OUT for https://${DOMAIN}/"
echo "Upload it in Teams: Apps -> Manage your apps -> Upload an app -> Upload a custom app"
