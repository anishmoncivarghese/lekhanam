#!/usr/bin/env node
/*
 * Build professional Mac App Store screenshots (2560×1600) from raw app
 * captures. Dark-premium black/gold template matching the Lekhanam website
 * brand. Renders each slide via headless Chrome at 2× for crisp text.
 *
 * Add a screen: append an entry to SLIDES and re-run `node scripts/build-appstore-screenshots.js`.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'appstore-screenshots')
const TMP = '/tmp/appstore-build'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(TMP, { recursive: true })

const dataURI = (rel) =>
  'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64')

const ICON = dataURI('website/assets/icon.png')

// ── Slide definitions ───────────────────────────────────────────────────────
// Cover is always first. Feature slides wrap a screenshot in a Mac window.
const SLIDES = [
  { type: 'cover', name: '01-cover' },
  {
    type: 'feature',
    name: '02-read-export',
    img: 'website/assets/read-export.png',
    headline: 'Read, then export in one click',
    subhead: 'A distraction-free reading view with Word & ePub export — print-ready',
  },
  {
    type: 'feature',
    name: '03-storyboard',
    img: 'website/assets/storyboard.png',
    headline: 'Plan your story, act by act',
    subhead: 'Storyboard every chapter — synopsis, structure, and flow in a single view',
  },
  {
    type: 'feature',
    name: '04-characters',
    img: 'website/assets/characters.png',
    headline: 'Keep your whole cast in focus',
    subhead: 'Rich character profiles — roles, traits, and backstory beside your draft',
  },
  {
    type: 'feature',
    name: '05-cover-design',
    img: 'website/assets/cover-design.png',
    headline: 'Design your cover, right inside',
    subhead: 'A built-in cover designer — text, images, and export, no other tools needed',
  },
  {
    type: 'feature',
    name: '06-dashboard',
    img: 'website/assets/dashboard.png',
    headline: 'Know your progress at a glance',
    subhead: 'Word counts, daily goals, and writing streaks — all on one dashboard',
  },
]

// ── Shared chrome ───────────────────────────────────────────────────────────
const SPARKLE = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M12 2l1.9 5.6a4 4 0 0 0 2.5 2.5L22 12l-5.6 1.9a4 4 0 0 0-2.5 2.5L12 22l-1.9-5.6a4 4 0 0 0-2.5-2.5L2 12l5.6-1.9a4 4 0 0 0 2.5-2.5L12 2z" fill="#e09a20"/></svg>`

const HEAD = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:800px;overflow:hidden}
body{background:#080808;font-family:-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.stage{position:relative;width:1280px;height:800px;overflow:hidden}
.glow{position:absolute;top:-220px;left:50%;transform:translateX(-50%);width:1200px;height:760px;background:radial-gradient(ellipse at center,rgba(200,134,10,.20),rgba(200,134,10,.05) 45%,transparent 70%)}
.badge{display:inline-flex;align-items:center;gap:13px;padding:16px 36px;border-radius:999px;background:linear-gradient(180deg,rgba(200,134,10,.18),rgba(200,134,10,.07));border:1.5px solid rgba(224,154,32,.6);box-shadow:0 0 50px rgba(200,134,10,.16)}
.badge span{font-size:27px;font-weight:600;color:#ecd3a0;letter-spacing:.01em}
</style></head><body>`

const coverHTML = () => `${HEAD}
<div class="stage" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div class="glow"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 125%,rgba(0,0,0,.7),transparent 55%)"></div>
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:40px;padding:0 120px">
    <img src="${ICON}" style="width:196px;height:196px;border-radius:46px;box-shadow:0 36px 90px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.05)"/>
    <div style="display:flex;flex-direction:column;align-items:center;gap:22px">
      <div style="font-size:86px;font-weight:600;letter-spacing:.005em;color:#f4f1ec;line-height:1">Lekhanam</div>
      <div style="font-size:31px;font-weight:400;color:#b3aea4;line-height:1.45;max-width:780px">Write, format, and publish your book — entirely on your Mac. Private by design, yours forever.</div>
    </div>
    <div class="badge">${SPARKLE}<span>Free for life · Early adopters</span></div>
  </div>
</div></body></html>`

const featureHTML = (s) => `${HEAD}
<div class="stage" style="display:flex;flex-direction:column;align-items:center">
  <div class="glow"></div>
  <div style="position:relative;text-align:center;padding-top:78px;max-width:1000px">
    <div style="font-size:58px;font-weight:600;color:#f4f1ec;line-height:1.12;letter-spacing:.005em">${s.headline}</div>
    <div style="font-size:27px;font-weight:400;color:#8f8a80;line-height:1.4;margin-top:20px">${s.subhead}</div>
  </div>
  <div style="position:relative;margin-top:60px;width:1080px;flex:1">
    <div style="position:absolute;inset:-2% -4% 0;background:radial-gradient(ellipse at 50% 30%,rgba(200,134,10,.12),transparent 60%)"></div>
    <div style="position:relative;border-radius:20px 20px 0 0;overflow:hidden;box-shadow:0 50px 130px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)">
      <div style="height:44px;background:#efe9e0;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid #e0d9cd">
        <span style="width:14px;height:14px;border-radius:50%;background:#ff5f57"></span>
        <span style="width:14px;height:14px;border-radius:50%;background:#febc2e"></span>
        <span style="width:14px;height:14px;border-radius:50%;background:#28c840"></span>
      </div>
      <img src="${dataURI(s.img)}" style="display:block;width:1080px"/>
    </div>
  </div>
</div></body></html>`

// ── Render ──────────────────────────────────────────────────────────────────
for (const s of SLIDES) {
  const html = s.type === 'cover' ? coverHTML() : featureHTML(s)
  const htmlPath = path.join(TMP, `${s.name}.html`)
  const outPath = path.join(OUT, `${s.name}.png`)
  fs.writeFileSync(htmlPath, html)
  execSync(
    `"${CHROME}" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 ` +
      `--window-size=1280,800 --screenshot="${outPath}" "file://${htmlPath}"`,
    { stdio: 'pipe' }
  )
  console.log(`rendered ${s.name}.png`)
}
console.log(`\nDone → ${OUT}`)
