/**
 * dsh-taskline-bili: ships billion-context and exposes a `bili:runtime` facade.
 *
 * The proxy is spawned by bili-native on an ephemeral zone port. Discovery
 * matches `/__bili/health`'s watchdog parent pid to this host process, so the
 * facade attaches to the proxy this DSH instance actually owns.
 */
import { createBiliClient, discoverOrigin, originFromEnv } from './client.js'

export const name = 'taskline-bili'
export const inject = []

export function apply(ctx) {
  let origin
  let client
  let available

  async function resolve() {
    if (client !== undefined) return client
    origin = originFromEnv()
    if (globalThis.process?.env?.BILLION_CONTEXT_PROXY === undefined) {
      origin = await discoverOrigin()
    }
    client = createBiliClient({ origin })
    return client
  }

  async function probe() {
    const current = await resolve()
    try {
      const health = await current.health()
      available = health.ok === true
    } catch {
      available = false
    }
    return available
  }

  ctx.provide('bili:runtime', {
    get origin() {
      return origin
    },
    get client() {
      return client
    },
    /** Probe (and cache) the proxy health; discovery retries when unavailable. */
    async available() {
      if (available === undefined) await probe()
      if (available === false) {
        client = undefined
        origin = undefined
        await probe()
      }
      return available
    },
    async refresh() {
      available = undefined
      return probe()
    },
  })

  void probe()
}
