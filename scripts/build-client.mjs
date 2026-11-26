import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const out = resolve(root, 'packages/dsh-taskline-ui/client/lib/client.js')
await mkdir(dirname(out), { recursive: true })
await build({
  entryPoints: [resolve(root, 'packages/dsh-taskline-ui/src/client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  write: false,
  logLevel: 'silent',
}).then(async (result) => {
  const code = result.outputFiles[0].text
  const wrapped = `window.__ModuleLoader__.load({\n\tid: "dsh-taskline-ui",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n${code}\n\t\treturn module.exports;\n\t}\n});\n`
  await writeFile(out, wrapped)
  process.stdout.write(`built ${out}\n`)
})
