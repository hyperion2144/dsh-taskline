// Restart-recovery check: open an existing taskline session and confirm its
// history loads (no "历史加载失败"). Usage: node load-history.mjs <url>
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2]
if (url === undefined) throw new Error('usage: load-history.mjs <url>')
const profile = await mkdtemp(join(tmpdir(), 'taskline-history-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--remote-debugging-port=9466', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,1000', url,
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let target
for (let i = 0; i < 200; i += 1) {
  try {
    const pages = await (await fetch('http://127.0.0.1:9466/json')).json()
    target = pages.find((page) => page.type === 'page')
    if (target !== undefined) break
  } catch { }
  await sleep(150)
}
if (target === undefined) throw new Error('chrome devtools did not start')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
const errors = []
socket.addEventListener('message', (message) => {
  const payload = JSON.parse(message.data)
  if (payload.id !== undefined) {
    pending.get(payload.id)?.(payload)
    pending.delete(payload.id)
  } else if (payload.method === 'Runtime.exceptionThrown') {
    errors.push(String(payload.params.exceptionDetails.text))
  }
})
const call = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId
  pending.set(id, resolve)
  socket.send(JSON.stringify({ id, method, params }))
})
await call('Runtime.enable')
await sleep(3500)
const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.result?.result?.value
}
await evaluate(`(() => {
  const el = [...document.querySelectorAll('button,div,span')].find((e) => e.children.length === 0 && e.textContent.trim() === '继续')
  el?.click(); return Boolean(el)
})()`)
await sleep(600)
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '打开侧边栏')
  b?.click(); return Boolean(b)
})()`)
await sleep(800)
const clicked = await evaluate(`(() => {
  const el = [...document.querySelectorAll('div,button,a,span')].find((e) => e.children.length === 0 && e.textContent.includes('只调用 task_start'))
  el?.click(); return Boolean(el)
})()`)
await sleep(4000)
const text = await evaluate('document.body.innerText')
const result = {
  clicked,
  loaded: text.includes('task_start') || text.includes('done'),
  loadFailed: text.includes('历史加载失败'),
  errors: errors.slice(0, 5),
}
console.log(JSON.stringify(result, null, 2))
socket.close()
chrome.kill()
if (!result.clicked || !result.loaded || result.loadFailed) process.exitCode = 1
