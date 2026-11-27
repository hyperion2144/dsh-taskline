// Real-web acceptance driver: plugin detail checks + three constrained turns
// (task_start/read, task_complete, task_compress) against a live dsh web page.
// Usage: node real-web.mjs <url> [--screenshot-dir DIR]
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2]
const shotIndex = process.argv.indexOf('--screenshot-dir')
const shotDir = shotIndex === -1 ? '/tmp' : process.argv[shotIndex + 1]
if (url === undefined) throw new Error('usage: real-web.mjs <url> [--screenshot-dir DIR]')

const profile = await mkdtemp(join(tmpdir(), 'taskline-real-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--remote-debugging-port=9433',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--window-size=1400,1000',
  url,
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let target
for (let i = 0; i < 200; i += 1) {
  try {
    const pages = await (await fetch('http://127.0.0.1:9433/json')).json()
    target = pages.find((page) => page.type === 'page')
    if (target !== undefined) break
  } catch {}
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
  } else if (payload.method === 'Runtime.consoleAPICalled' && payload.params.type === 'error') {
    errors.push(payload.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
  }
})
const call = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId
  pending.set(id, resolve)
  socket.send(JSON.stringify({ id, method, params }))
})
await call('Runtime.enable')
await call('Page.enable')
await sleep(3500)
const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.result?.result?.value
}
const dismissWelcome = async () => {
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('button,div,span')].find((e) => e.children.length === 0 && e.textContent.trim() === '继续')
    el?.click(); return Boolean(el)
  })()`)
  await sleep(800)
}
const clickText = async (text, exact = false) => evaluate(`(() => {
  const el = [...document.querySelectorAll('div,button,a,span')].find((e) => e.children.length === 0
    && ${exact ? `e.textContent.trim() === ${JSON.stringify(text)}` : `e.textContent.includes(${JSON.stringify(text)})`})
  el?.click(); return Boolean(el)
})()`)
const screenshot = async (name) => {
  const capture = await call('Page.captureScreenshot', { format: 'png' })
  if (capture.result?.data !== undefined) await writeFile(join(shotDir, name), Buffer.from(capture.result.data, 'base64'))
}

await dismissWelcome()
await clickText('插件', true)
await sleep(1800)
await clickText('dsh-taskline', true)
await sleep(1800)
const pluginText = await evaluate('document.body.innerText')
const plugin = {
  components: (pluginText.match(/运行中/g) ?? []).length,
  hasConfig: pluginText.includes('嵌套层数') && pluginText.includes('自动进度') === false,
  hasSave: pluginText.includes('保存'),
}
await screenshot('taskline-plugin-detail.png')

await clickText('新会话', true)
await sleep(2000)
const prompts = [
  '只调用 task_start 工具创建标题为 big 的任务，然后只调用 read 工具读取 /Users/mutou/vault/projects/dsh-taskline/docs/spec-v0.1.md；不要总结、不要写文件、不要运行其他工具。完成后只回复 done。',
  '只调用 task_complete 工具关闭任务 t-1，不要做其他操作。完成后只回复 done。',
  '只调用 task_compress 工具，参数 tasks 为 [{"taskId":"t-1","summary":"<按 bili compress 要求写一段摘要>"}]；不要做其他操作。完成后只回复 done。',
]
const send = async (text) => {
  const rect = await evaluate(`(() => {
    const e = document.querySelector('[contenteditable="true"]')
    if (!e) return null
    e.scrollIntoView({ block: 'center' })
    const r = e.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (rect === null) return false
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
  await sleep(300)
  for (const ch of text) {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
  await sleep(500)
  const disabled = await evaluate(`document.querySelector('button[aria-label="发送消息"]')?.disabled ?? true`)
  if (disabled) return false
  await evaluate(`document.querySelector('button[aria-label="发送消息"]').click()`)
  const start = Date.now()
  let idle = 0
  while (Date.now() - start < 150000) {
    await sleep(3000)
    const body = await evaluate('document.body.innerText')
    const streaming = body.includes('深度求索中') || body.includes('正在准备') || body.includes('停止')
    const blocked = await evaluate(`document.querySelector('button[aria-label="发送消息"]')?.disabled ?? true`)
    if (!streaming && !blocked) idle += 1
    else idle = 0
    if (idle >= 3) break
  }
  return true
}

const sent = []
for (const prompt of prompts) {
  const ok = await send(prompt)
  sent.push(ok)
  if (!ok) break
}
for (let i = 0; i < 10; i += 1) {
  if (String(await evaluate('document.body.innerText')).includes('上下文已压缩')) break
  await sleep(1000)
}
await screenshot('taskline-conversation.png')
const body = await evaluate('document.body.innerText')
console.log(JSON.stringify({ plugin, sent, compressed: String(body).includes('上下文已压缩'), errors }, null, 2))
socket.close()
chrome.kill()
if (!plugin.hasConfig || !plugin.hasSave || plugin.components < 7 || sent.some((ok) => !ok)) process.exitCode = 1
