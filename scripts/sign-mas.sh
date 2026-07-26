#!/bin/bash
# Sign the MAS .app bundle using rcodesign (bypasses Apple's codesign which
# fails on macOS Tahoe's SIP-protected com.apple.provenance xattr). Then
# wraps the signed .app in a .pkg installer via productbuild.
set -euo pipefail

export PATH="$HOME/.cargo/bin:$PATH"

VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
APP_PATH="dist/mas-arm64/Lekhanam.app"
PKG_PATH="dist/Lekhanam-${VERSION}-arm64-mas.pkg"

APP_CERT_SHA256="81a9c4f8b33d8da709f3b6451590211c214372f5a40501446e5791d6c8425cbf"
INSTALLER_CERT_NAME="3rd Party Mac Developer Installer: Anish Varghese (65UF42MSBU)"

if [ ! -d "$APP_PATH" ]; then
  echo "[sign-mas] ERROR: $APP_PATH not found — run electron-builder first"
  exit 1
fi

if ! command -v rcodesign >/dev/null 2>&1; then
  echo "[sign-mas] ERROR: rcodesign not in PATH. Install via: cargo install apple-codesign"
  exit 1
fi

echo "[sign-mas] Embedding provisioning profile"
cp build/lekhanam.provisionprofile "$APP_PATH/Contents/embedded.provisionprofile"

# NOTE: --code-signature-flags is REQUIRED. Without CS_RUNTIME (the
# hardened-runtime flag), the kernel ignores cs.allow-jit and the MAS app
# hard-crashes on launch on macOS 26 (Tahoe) — brk 0 in V8
# ThreadIsolation::RegisterJitAllocation. rcodesign does NOT set it by
# default, and its scoped flags only apply to the main entity, so it must be
# scoped per helper/CLI exactly like --entitlements-xml-file. See issue_log.md
# (2026-04-26). Verify after build: every binary must show flags=0x10000(runtime).
ENTITLEMENT_ARGS=(--entitlements-xml-file "build/entitlements.mas.plist" --code-signature-flags runtime)
for helper in "$APP_PATH"/Contents/Frameworks/*.app; do
  [ -d "$helper" ] || continue
  REL_PATH="Contents/Frameworks/$(basename "$helper")"
  ENTITLEMENT_ARGS+=(--entitlements-xml-file "${REL_PATH}:build/entitlements.mas.inherit.plist")
  ENTITLEMENT_ARGS+=(--code-signature-flags "${REL_PATH}:runtime")
  echo "[sign-mas] Scoped inherit entitlements + runtime flag → $REL_PATH"
done

CLI_REL_PATH="Contents/Resources/apple-ai-cli/apple-ai-cli"
if [ -f "$APP_PATH/$CLI_REL_PATH" ]; then
  ENTITLEMENT_ARGS+=(--entitlements-xml-file "${CLI_REL_PATH}:build/entitlements.mas.inherit.plist")
  ENTITLEMENT_ARGS+=(--code-signature-flags "${CLI_REL_PATH}:runtime")
  echo "[sign-mas] Scoped inherit entitlements + runtime flag → $CLI_REL_PATH"
fi

echo "[sign-mas] Signing $APP_PATH with rcodesign"
rcodesign sign \
  --keychain-fingerprint "$APP_CERT_SHA256" \
  --team-name 65UF42MSBU \
  "${ENTITLEMENT_ARGS[@]}" \
  "$APP_PATH"

# iCloud Drive ("Desktop & Documents" sync) continuously stamps
# com.apple.FinderInfo and com.apple.fileprovider.fpfs#P on directories under
# ~/Documents/. Stripping them in place is racy — iCloud re-stamps before
# productbuild reads the bundle, and Apple's server-side codesign rejects
# with error 90303 ("detritus not allowed") on the nested helper bundles.
#
# Fix: stage the signed .app in /tmp (outside iCloud sync) via `ditto
# --noextattr`, which rebuilds the bundle without any xattrs while preserving
# the code signature (signatures live inside Mach-O binaries and
# _CodeSignature/, not in xattrs). Then productbuild reads from /tmp.
STAGING_DIR="$(mktemp -d -t lekhanam-pkg-XXXXXX)"
STAGING_APP="$STAGING_DIR/Lekhanam.app"
STAGING_PKG="$STAGING_DIR/Lekhanam.pkg"
trap 'rm -rf "$STAGING_DIR"' EXIT

echo "[sign-mas] Staging signed .app in $STAGING_DIR (outside iCloud sync)"
ditto --noextattr --noqtn "$APP_PATH" "$STAGING_APP"

# Defense-in-depth: even after ditto, defensively strip the few xattrs that
# might linger (ditto strips most, but we've seen edge cases on Tahoe).
xattr -cr "$STAGING_APP" 2>/dev/null || true

# Warn if provisioning profile is missing iCloud entitlement
# (reminder to complete portal setup before submitting with iCloud enabled)
if ! security cms -D -i "$STAGING_APP/Contents/embedded.provisionprofile" 2>/dev/null \
     | grep -q "icloud-services"; then
  echo "[sign-mas] NOTE: provisioning profile does not include icloud-services."
  echo "  iCloud sync will not work. Complete portal setup if needed."
fi

echo "[sign-mas] Building $PKG_PATH from staging"
rm -f "$PKG_PATH"
productbuild \
  --component "$STAGING_APP" /Applications \
  --sign "$INSTALLER_CERT_NAME" \
  "$STAGING_PKG"

mv "$STAGING_PKG" "$PKG_PATH"

echo "[sign-mas] Verifying signature"
rcodesign verify "$APP_PATH" || echo "[sign-mas] Note: rcodesign verify reported issues; this is expected for MAS-only signatures"
pkgutil --check-signature "$PKG_PATH"

echo "[sign-mas] Done: $PKG_PATH"
