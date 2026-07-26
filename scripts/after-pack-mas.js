const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

exports.default = async function (context) {
  if (context.packager.platform.name !== 'mac' || context.targets[0]?.name !== 'mas') return

  const appOutDir = context.appOutDir
  const appPath = path.join(appOutDir, 'Lekhanam.app')
  const unpackedBase = path.join(
    appPath,
    'Contents/Resources/app.asar.unpacked/node_modules/nodejs-whisper/cpp/whisper.cpp'
  )
  const llamaUnpackedBase = path.join(
    appPath,
    'Contents/Resources/app.asar.unpacked/node_modules'
  )
  const dirsToRemove = [
    path.join(unpackedBase, 'examples'),
    path.join(unpackedBase, 'tests'),
    path.join(unpackedBase, 'bindings'),
    // whisper-cli executable, libggml/libwhisper dylibs, cmake artifacts —
    // unused in MAS (SpeechService is process.mas gated). Unsigned binaries
    // would cause App Store rejection.
    path.join(unpackedBase, 'build'),
    // node-llama-cpp native components — same story. LlamaService.initialize()
    // throws on process.mas before any dynamic import, so the JS shell stays
    // (cheaper than retypechecking type-only imports) but the dylibs and
    // C++ source are pure dead weight in the MAS bundle.
    path.join(llamaUnpackedBase, '@node-llama-cpp'),
    path.join(llamaUnpackedBase, 'node-llama-cpp', 'llama'),
    path.join(llamaUnpackedBase, 'node-llama-cpp', 'bins'),
  ]

  for (const dir of dirsToRemove) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`[after-pack-mas] Removed: ${dir}`)
    }
  }

  // Squirrel auto-updater's Login Helper is inert in MAS (App Store handles
  // updates) but its binary carries a com.apple.provenance xattr from the
  // Electron cache that codesign refuses to sign. Remove the entire
  // LoginItems dir to skip the failing signing step.
  const loginItemsDir = path.join(appPath, 'Contents/Library/LoginItems')
  if (fs.existsSync(loginItemsDir)) {
    fs.rmSync(loginItemsDir, { recursive: true, force: true })
    console.log(`[after-pack-mas] Removed LoginItems (Squirrel Login Helper — unused in MAS)`)
  }

  // macOS Sequoia+ stamps binaries with com.apple.provenance xattr that's
  // protected — `xattr -d com.apple.provenance` silently fails. codesign
  // rejects it with "resource fork, Finder information, or similar detritus
  // not allowed". Workaround: rebuild the entire .app with ditto --noextattr
  // to a sibling dir, then swap. ditto creates new inodes with no xattrs.
  console.log(`[after-pack-mas] Stripping com.apple.provenance via ditto rebuild...`)
  const cleanPath = appPath + '.clean'
  if (fs.existsSync(cleanPath)) fs.rmSync(cleanPath, { recursive: true, force: true })
  execSync(`ditto --noextattr --noqtn "${appPath}" "${cleanPath}"`, { stdio: 'inherit' })
  fs.rmSync(appPath, { recursive: true, force: true })
  fs.renameSync(cleanPath, appPath)
  console.log(`[after-pack-mas] Rebuilt ${appPath} without extended attributes`)
}
