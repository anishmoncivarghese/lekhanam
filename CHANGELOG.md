# Changelog

All notable changes to Lekhanam are documented here.

Format: `Added` for new features, `Changed` for updates, `Fixed` for bug fixes, `Removed` for removals.

---

## [Unreleased]

### Planned for 1.0.2
- Upgrade Electron 29 → 36 (fixes macOS 26 Tahoe crash on app uninstall)
- Fix Apple Intelligence UI guards in Ghostwriter, Character Interview, and BubbleMenu
- Re-notarize after Electron upgrade

---

## [1.0.1] — 2026-03-14

First public release of Lekhanam (renamed from Bookly).

### Added
- **Book writing** — Create and manage multiple books with chapters, characters, and plot beats
- **Rich text editor** — TipTap-powered chapter editor with formatting toolbar (bold, italic, underline, headings, lists, alignment, font family)
- **AI Writing Assistant** — Local AI panel with three modes:
  - *Assist* — Select text → Expand, Shorten, or add Sensory Detail via BubbleMenu wand
  - *Ghostwriter* — Enter story beats → generate full prose passages
  - *Character Interview* — Multi-turn chat in a character's voice using their ghost, lie, and voice profile
- **Local AI model catalog** — Download and run Qwen2.5 models (micro/lite/standard/premium) entirely offline via Metal GPU
- **Apple Intelligence support** — Use Apple's on-device AI (macOS 26+) as an alternative to Qwen
- **Offline speech-to-text** — Dictate chapters using Vosk (interim) + Whisper.cpp (final transcription), no internet required
- **Cover Designer** — Konva canvas with front/back cover, text layers, image upload, filters, and PNG export
- **Export** — PDF (via jsPDF + html2canvas) and DOCX (via docx library)
- **Grammar checking** — harper.js WASM grammar and spell check inline in editor
- **Chapter snapshots** — Auto-save history with restore capability
- **Character profiles** — Ghost, lie, voice profile, and custom fields for deep character development
- **App lock** — Optional PIN lock for privacy
- **Data migration** — Auto-migrates data from legacy `~/Documents/Bookly/` folder on first launch
- **macOS notarization** — App is notarized and stapled for Gatekeeper compliance

### Technical
- Electron 29 + React 18 + TypeScript + electron-vite 3
- TailwindCSS v4
- All data stored locally in `~/Documents/Lekhanam/` as JSON files
- No accounts, no cloud, no subscriptions

### Known Issues
- App crashes (`EXC_BAD_ACCESS`) when deleted via Launchpad/right-click on macOS 26 Tahoe — root cause is Electron 29 incompatibility with macOS 26 pointer authentication. `Cmd+Q` and normal quit work without issues. Fix planned for 1.0.2 (Electron upgrade).
- Apple Intelligence features (Ghostwriter, Character Interview, BubbleMenu wand) are blocked by UI guards that only check for Qwen model status. Fix planned for 1.0.2.

---

*Lekhanam was previously named Bookly. The rename happened in March 2026.*
