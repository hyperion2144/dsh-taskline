import test from 'node:test'
import assert from 'node:assert/strict'
import { createBiliClient, originFromEnv, refsByRawId } from '../src/client.js'

function fakeFetch(routes) {
  const calls = []
  return {
    calls,
    async fetchImpl(url, init) {
      calls.push([url, init])
      const body = routes(url, init)
      return { ok: true, status: 200, async json() { return body } }
    },
  }
}

test('origin comes from the environment or the default port', () => {
  assert.equal(originFromEnv({ BILLION_CONTEXT_PROXY: 'http://127.0.0.1:19000/' }), 'http://127.0.0.1:19000')
  assert.equal(originFromEnv({}), 'http://127.0.0.1:18787')
})

test('snapshot refs keep protected entries as null', () => {
  const refs = refsByRawId({ orderedMessages: [
    { rawId: 'm-1', ref: 'm00001' },
    { rawId: 'm-2', ref: null },
  ] })
  assert.equal(refs.get('m-1'), 'm00001')
  assert.equal(refs.get('m-2'), null)
})

test('compress posts the protocol body and returns outcome', async () => {
  const fake = fakeFetch(() => ({ ok: true, tool: 'compress', outcome: 'refused', result: 'nope' }))
  const client = createBiliClient({ origin: 'http://127.0.0.1:18787', fetchImpl: fake.fetchImpl })
  const result = await client.compress('session-1', 'm00001–m00002 topic\n## 摘要\n…', 7)
  assert.equal(result.outcome, 'refused')
  const [url, init] = fake.calls[0]
  assert.ok(url.endsWith('/__bili/plugin/tool'))
  const sent = JSON.parse(init.body)
  assert.equal(sent.conversationId, 'session-1')
  assert.equal(sent.tool, 'compress')
  assert.equal(sent.nativeCaller, true)
  assert.equal(sent.expectedRevision, 7)
  assert.equal(sent.args.content, 'm00001–m00002 topic\n## 摘要\n…')
})

test('discoverOrigin matches the health watchdog parent pid', async () => {
  const { discoverOrigin } = await import('../src/client.js')
  const fetchImpl = async (url) => {
    if (url.includes(':18790/')) return { ok: true, status: 200, async json() { return { ok: true, watchdog: { parentPid: 1, watchers: [42] } } } }
    throw new Error('refused')
  }
  const origin = await discoverOrigin({ fetchImpl, base: 18788, span: 4, parentPid: 42, timeoutMs: 50 })
  assert.equal(origin, 'http://127.0.0.1:18790')
})
