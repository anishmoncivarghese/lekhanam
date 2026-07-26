# Lekhanam

**A local, privacy-first book-writing app for macOS.** Lekhanam is a native
desktop writing environment for authors — organize a novel by chapters, draft in
a distraction-free rich-text editor, and get AI writing assistance that runs
**entirely on your Mac**. No cloud account required, no manuscript ever leaves
your machine.

> This is the open-source code for Lekhanam. A signed, notarized, ready-to-run
> build is also available on the Mac App Store for those who'd rather not build
> from source — that's the easiest way to support the project.

## Features

- **Chapter-based manuscript organization** with an outliner and character/plot notes.
- **Rich-text editor** built on [TipTap](https://tiptap.dev/) — headings, tables,
  images, highlights, text styles, word count, and more.
- **On-device AI assistant ("Lekha")** powered by [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp) —
  brainstorm, rewrite, and continue prose with a local LLM. Nothing is sent to a server.
- **Apple Intelligence integration** (macOS 26+) as an optional local model backend.
- **Speech-to-text dictation** via on-device Whisper / Vosk — your audio never leaves the Mac.
- **Export** to DOCX, PDF, and EPUB.
- **iCloud sync** (in the Mac App Store build).

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 18](https://react.dev/) + [Zustand](https://github.com/pmndrs/zustand) + [Tailwind CSS 4](https://tailwindcss.com/)
- [TipTap](https://tiptap.dev/) editor
- On-device AI: `node-llama-cpp`, `nodejs-whisper`, `vosk-browser`, and a small
  Swift CLI (`resources/apple-ai-cli/main.swift`) bridging Apple Intelligence

## Getting started

Requirements: macOS, Node.js 18+, and Xcode command-line tools (for native modules
and the Swift AI bridge).

```bash
git clone https://github.com/<your-username>/lekhanam.git
cd lekhanam
npm install
npm run dev
```

## Important: AI models are not included

The on-device model weights live in `resources/models/` and are **intentionally
excluded from this repository** — they are hundreds of megabytes to gigabytes and
are not redistributable here. The app builds and runs without them, but the AI
writing and speech features stay inactive until you supply compatible model files:

- A GGUF chat model for `node-llama-cpp` (the Lekha assistant)
- A Whisper model for `nodejs-whisper` and/or a Vosk model for `vosk-browser` (dictation)

Place them under `resources/models/` following the paths referenced in
`src/main/LlamaService.ts` and `src/main/SpeechService.ts`.

## Building a distributable

```bash
npm run build          # compile main / preload / renderer
npm run dist:test      # unsigned local .dmg (no Apple identity needed)
```

Producing a **signed** DMG or a Mac App Store package requires your **own** Apple
Developer account. The signing configuration in `package.json`,
`electron-builder-mas.yml`, and `scripts/sign-mas.sh` references the original
author's Team ID, certificate names, and a `build/*.provisionprofile` path — you
must replace all of these with your own identity and provisioning profile. See
`docs/electron-mas-submission-guide.md` for the full MAS flow.

## Contributing

Issues and pull requests are welcome. Please keep changes focused and describe
what problem they solve.

## License

Source code is released under the [MIT License](LICENSE).

**Trademark:** the MIT license covers the code, **not** the "Lekhanam" name or
logo. You're free to fork and redistribute, but please ship your fork under a
different name and branding. See the trademark notice in [LICENSE](LICENSE).
