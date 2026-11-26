// Drive the real DSH web page in Google Chrome over the DevTools protocol.
// Usage: node browser.mjs <url> [--screenshot out.png]
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

const url = process.argv[2]
if (url === undefined) throw new Error('usage: browser.mjs <url> [--screenshot out.png]')
const shotIndex = process.argv.indexOf('--screenshot')
const shotPath = shotIndex === -1 ? undefined : process.argv[shotIndex + 1]
const profile = await mkdtemp(join(tmpdir(), 'taskline-chrome-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--remote-debugging-port=9333',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  url,
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let target
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const pages = await (await fetch('http://127.0.0.1:9333/json')).json()
    target = pages.find((page) => page.type === 'page')
    if (target !== undefined) break
  } catch {}
  await sleep(150)
}
if (target === undefined) { chrome.kill(); throw new Error('chrome devtools did not start') }

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
const consoleErrors = []
socket.addEventListener('message', (message) => {
  const payload = JSON.parse(message.data)
  if (payload.id !== undefined) {
    const entry = pending.get(payload.id)
    pending.delete(payload.id)
    entry.index(payload)
  } else if (payload.method === 'Runtime.consoleAPICalled' && payload.params.type === 'error') {
    consoleErrors.push(payload.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
  } else if (payload.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(String(payload.params.exceptionDetails.text))
  }
})
const call = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId
  pending.set(id, { index: resolve })
  socket.send(JSON.stringify({ id, method, params }))
})
await call('Runtime.enable')
await call('Page.enable')
await sleep(2500)
const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.result?.result?.value
}
const boot = await evaluate('JSON.stringify((globalThis.__DSH_BOOT__?.entries ?? []).map((entry) => entry.id))')
const entries = boot === undefined ? [] : JSON.parse(boot)
const hasTaskline = entries.includes('dsh-taskline-ui')
const bodyText = await evaluate('document.body?.innerText?.slice(0, 2000) ?? ""')
const dock = await evaluate('document.querySelectorAll("[class*=taskline]").length')
let screenshot
if (shotPath !== undefined) {
  const capture = await call('Page.captureScreenshot', { format: 'png' })
  screenshot = capture.result?.data
  if (screenshot !== undefined) await writeFile(shotPath, Buffer.from(screenshot, 'base64'))
}
console.log(JSON.stringify({ url, hasTaskline, dockNodes: dock, consoleErrors, body: String(bodyText).slice(0, 300), screenshot: shotPath ?? null }, null, 2))
socket.close()
chrome.kill()
if (!hasTaskline) process.exitCode = 1
