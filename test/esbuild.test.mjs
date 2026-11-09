import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import keyless from '../dist/esm/unplugin/esbuild.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')
const RUNTIME = path.resolve(HERE, '../dist/esm/index.js')

test('the esbuild adapter bundles catalogs and strips the dev endpoint', async () => {
  const dir = path.join(ROOT, `esbuild-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default { source: 'zh-CN', locales: ['en-US'], provider: 'manual' }\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: 'Save Project' } }),
  )
  fs.writeFileSync(
    path.join(dir, 'app.js'),
    `import { t, setLocale } from 'source-i18n'
export { setLocale }
export const read = () => t('保存项目')
`,
  )

  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      entryPoints: [path.join(dir, 'app.js')],
      bundle: true,
      format: 'esm',
      outfile: path.join(dir, 'out.mjs'),
      alias: { 'source-i18n': RUNTIME },
      plugins: [keyless({ root: dir })],
      logLevel: 'silent',
    })
  } finally {
    process.env.NODE_ENV = previous
  }

  const code = fs.readFileSync(path.join(dir, 'out.mjs'), 'utf8')
  assert.ok(code.includes('Save Project'), 'catalogs are bundled')
  assert.ok(!code.includes('__source-i18n'), 'no dev endpoint in a production bundle')
  assert.ok(!code.includes('x-source-i18n-token'), 'no dev token in a production bundle')

  const module = await import(pathToFileURL(path.join(dir, 'out.mjs')).href)
  module.setLocale('en-US')
  assert.equal(module.read(), 'Save Project')
})
