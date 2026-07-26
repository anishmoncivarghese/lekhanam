# Electron MAS Submission Guide — Reference

**Source URL (check for updates):** https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide

**Raw markdown (always current):** https://raw.githubusercontent.com/electron/website/main/docs/latest/tutorial/mac-app-store-submission-guide.md

**Why this is saved here:** the rendered docs page hides important content inside a `<details>` collapsible box ("Extra steps without electron-osx-sign"). That hidden content is what fixed our 9-hour MAS-sandbox + macOS 26 crash on 2026-04-28. Future-you should always fetch the raw markdown, not just read the rendered page, to catch hidden details boxes.

To pull the latest version of this doc and diff it:

```bash
curl -sL https://raw.githubusercontent.com/electron/website/main/docs/latest/tutorial/mac-app-store-submission-guide.md \
  > /tmp/mas-submission-guide-latest.md
diff docs/electron-mas-submission-guide.md /tmp/mas-submission-guide-latest.md
```

If the diff shows changes, update this file and re-read the relevant sections.

---

## Critical content from the docs (as of 2026-04-28)

### Enable Apple's App Sandbox

Apps submitted to the Mac App Store must run under Apple's App Sandbox, and only the MAS build of Electron can run with the App Sandbox.

When signing the app with `@electron/osx-sign`, it automatically adds the necessary entitlements. We don't use `@electron/osx-sign` (we use a custom `scripts/sign-mas.sh` calling Apple's `codesign` directly), so we must add them manually.

### Extra steps without electron-osx-sign (THE HIDDEN DETAILS BOX)

If signing without `@electron/osx-sign`, the app bundle's entitlements **must** include:

```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.application-groups</key>
<array>
  <string>TEAM_ID.your.bundle.id</string>
</array>
```

For Lekhanam: `<string>65UF42MSBU.com.lekhanam.app</string>`

The helpers' inherit entitlements must include:

```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.inherit</key>
<true/>
```

The app's `Info.plist` **must** include:

```xml
<key>ElectronTeamID</key>
<string>TEAM_ID</string>
```

For Lekhanam: `<string>65UF42MSBU</string>` — set in `electron-builder-mas.yml` under `extendInfo`.

> When using `@electron/osx-sign`, the `ElectronTeamID` key is added automatically by extracting the Team ID from the certificate's name. You may need to manually add this key if `@electron/osx-sign` could not find the correct Team ID.

### Why these are required

`com.apple.security.application-groups` is what enables Chromium's `MachPortRendezvousServer` to register and look up mach services for parent ↔ child process IPC under the App Sandbox. Without it, on macOS 14+ the sandbox denies `mach-register com.<bundle-id>.MachPortRendezvousServer.<PID>`, Chromium's process bootstrap fails, and the app crashes deep in V8 / Chromium internals (the failure is many layers downstream of the actual missing-entitlement, which is why it's hard to diagnose from the crash trace alone).

`ElectronTeamID` in `Info.plist` tells Electron at runtime which Team ID prefix to use when constructing the application group identifier for IPC.

### Limitations of the MAS Build (relevant to our app)

- `crashReporter` and `autoUpdater` are disabled in the MAS build
- Apps will not be aware of DNS changes
- Video capture may not work for some machines
- Certain accessibility features may not work

### Common entitlements reference

- `com.apple.security.network.client` — outgoing network connections
- `com.apple.security.network.server` — incoming network listening (we don't need this)
- `com.apple.security.files.user-selected.read-only` — for `dialog.showOpenDialog`
- `com.apple.security.files.user-selected.read-write` — for `dialog.showSaveDialog`

### Required certificates

- "Apple Distribution" (a.k.a. "3rd Party Mac Developer Application" — legacy name) — signs the .app
- "Mac Installer Distribution" (a.k.a. "3rd Party Mac Developer Installer" — legacy name) — signs the .pkg via `productbuild`

Apple Development cert is for local-machine testing only; cannot be submitted to MAS.

---

## How this maps to our build pipeline

| Doc requirement | Where it lives in our project |
|---|---|
| `com.apple.security.app-sandbox` (parent) | `build/entitlements.mas.plist` |
| `com.apple.security.application-groups` (parent) | `build/entitlements.mas.plist` |
| `com.apple.security.app-sandbox` (helpers) | `build/entitlements.mas.inherit.plist` |
| `com.apple.security.inherit` (helpers) | `build/entitlements.mas.inherit.plist` |
| `ElectronTeamID` in Info.plist | `electron-builder-mas.yml` → `mas.extendInfo` |
| Provisioning profile placement | `scripts/sign-mas.sh` (cp + xattr -c) |
| Inside-out codesigning | `scripts/sign-mas.sh` (dylibs → frameworks → CLI → helpers → main) |
| MAS-incompatible native module ring-fence | `process.mas` runtime guards in src/main/, `scripts/after-pack-mas.js` strips llama bins |

---

## Future-self checklist when something breaks on a new macOS major version

1. **Diff this file against the upstream docs.** Apple changes sandbox enforcement on macOS major versions; Electron updates this doc accordingly.
2. **Read every `<details>` block in the raw markdown.** The rendered HTML hides them by default. The hidden content is what burned us once.
3. **Search the raw markdown for "without electron-osx-sign"** — that's the section relevant to our custom signing pipeline.
4. **Search for our entitlement keys** in the docs — if any of them are deprecated or replaced in a new doc revision, update accordingly.
