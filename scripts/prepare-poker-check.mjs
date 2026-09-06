import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const destination = resolve('public/vendor/cap/0.1.57')
await mkdir(destination, { recursive: true })
for (const [source, name] of [
  ['cap-widget/LICENSE', 'LICENSE-cap.txt'],
  ['@cap.js/wasm/browser/cap_wasm_bg.wasm', 'cap_wasm_bg.wasm'],
  ['pako/dist/pako_inflate.min.js', 'pako_inflate.min.js'],
  ['pako/LICENSE', 'LICENSE-pako.txt'],
]) await cp(resolve('node_modules', source), resolve(destination, name))
// The widget preloads WASM when its script executes, before React can set globals.
// Rewrite only the pinned asset defaults so even that early request stays local.
let widget = await readFile(resolve('node_modules/cap-widget/cap.min.js'), 'utf8')
for (const [remote, local] of [
  ['https://cdn.jsdelivr.net/npm/@cap.js/wasm@0.0.7/browser/cap_wasm_bg.wasm', '/vendor/cap/0.1.57/cap_wasm_bg.wasm'],
  ['https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako_inflate.min.js', '/vendor/cap/0.1.57/pako_inflate.min.js'],
]) {
  if (widget.split(remote).length !== 2) throw new Error('Pinned Cap asset changed; inspect before release')
  widget = widget.replace(remote, local)
}
if (widget.includes('cdn.jsdelivr.net')) throw new Error('Unexpected external Cap asset URL')
await writeFile(resolve(destination, 'cap.min.js'), widget)
console.log('Prepared pinned self-hosted Cap assets (no CDN required).')
