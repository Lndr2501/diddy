#!/usr/bin/env bash
# Hands the self-signed "Diddy Signing" identity to the CI, so Diddy Dev builds from GitHub keep
# one signature and macOS stops asking for the keychain password after every update (#164).
#
# Run on the Mac that has the identity (keychain `cinny-dev`), from the repository folder:
#   .github/scripts/dev-signing-secrets.sh [identity] [keychain]
# It exports the identity as .p12 into a temporary folder, sets the repository secrets
# DEV_SIGNING_CERTIFICATE, DEV_SIGNING_CERTIFICATE_PASSWORD and DEV_SIGNING_IDENTITY with `gh`,
# and deletes the export again. macOS asks for the keychain password once while exporting.
set -euo pipefail

identity="${1:-Diddy Signing}"
keychain="${2:-$HOME/Library/Keychains/cinny-dev.keychain-db}"
repo="${DIDDY_REPO:-Lndr2501/diddy}"

command -v gh >/dev/null || { echo "needs the GitHub CLI (gh), logged in" >&2; exit 1; }
security find-identity -p codesigning "$keychain" | grep -q "\"$identity\"" || {
  echo "identity \"$identity\" not found in $keychain" >&2
  exit 1
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
password="$(openssl rand -hex 24)"
security export -k "$keychain" -t identities -f pkcs12 -P "$password" -o "$work/dev.p12"

base64 -i "$work/dev.p12" | tr -d '\n' | gh secret set DEV_SIGNING_CERTIFICATE --repo "$repo"
printf '%s' "$password" | gh secret set DEV_SIGNING_CERTIFICATE_PASSWORD --repo "$repo"
printf '%s' "$identity" | gh secret set DEV_SIGNING_IDENTITY --repo "$repo"
echo "Secrets set. The next Dev build (Actions > Build > dev) is signed as \"$identity\"."
echo "After installing it, choose \"Always Allow\" once at the keychain prompt."
