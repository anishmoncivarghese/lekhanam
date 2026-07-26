// Patches cli-spinners@3.x inside node-llama-cpp to remove the
// `import ... with { type: 'json' }` syntax that requires Node 22+.
// Electron 29 embeds Node 20 which only supports the older `assert` syntax.
// We use `createRequire` instead, which works on Node 12+.
const fs = require('fs')
const path = require('path')

const target = path.join(
  __dirname, '..', 'node_modules', 'node-llama-cpp',
  'node_modules', 'cli-spinners', 'index.js'
)

if (!fs.existsSync(target)) {
  console.log('patch-cli-spinners: nested cli-spinners not found, skipping.')
  process.exit(0)
}

const original = fs.readFileSync(target, 'utf8')
if (!original.includes("with {type: 'json'}")) {
  console.log('patch-cli-spinners: already patched or not needed, skipping.')
  process.exit(0)
}

const patched = `import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const spinners = require('./spinners.json');

export default spinners;

const spinnersList = Object.keys(spinners);

export function randomSpinner() {
\tconst randomIndex = Math.floor(Math.random() * spinnersList.length);
\tconst spinnerName = spinnersList[randomIndex];
\treturn spinners[spinnerName];
}
`

fs.writeFileSync(target, patched)
console.log('patch-cli-spinners: patched successfully for Electron 29 / Node 20 compatibility.')
