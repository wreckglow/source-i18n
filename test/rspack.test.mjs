import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rspack } from '@rspack/core'
import KeylessPlugin from '../dist/esm/unplugin/webpack.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')
const RUNTIME = path.resolve(HERE, '../dist/esm/index.js')

test('a real rspack build bundles catalogs and strips the dev endpoint', { timeout: 120_000 }, async () => {
  const dir = path.join(ROOT, `rspack-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
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
    path.join(dir, 'src/index.js'),
    `import { t, setLocale } from 'source-i18n'
export { setLocale }
export const read = () => t('保存项目')
`,
  )

  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    const stats = await new Promise((resolve, reject) => {
      rspack(
        {
          mode: 'production',
          target: 'node',
          entry: path.join(dir, 'src/index.js'),
          output: {
            path: path.join(dir, 'dist'),
            filename: 'bundle.cjs',
            library: { type: 'commonjs2' },
          },
          resolve: { alias: { 'source-i18n': RUNTIME } },
          plugins: [new KeylessPlugin({ root: dir })],
          optimization: { minimize: false },
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      )
    })

    assert.equal(stats.hasErrors(), false, stats.toString({ errors: true }))
  } finally {
    process.env.NODE_ENV = previous
  }

  const code = fs.readFileSync(path.join(dir, 'dist/bundle.cjs'), 'utf8')
  assert.ok(code.includes('Save Project'), 'catalogs are bundled')
  assert.ok(!code.includes('__source-i18n'), 'no dev endpoint in a production bundle')
  assert.ok(!code.includes('x-source-i18n-token'), 'no dev token in a production bundle')

  const module = await import(pathToFileURL(path.join(dir, 'dist/bundle.cjs')).href)
  const loaded = module.default ?? module
  loaded.setLocale('en-US')
  assert.equal(loaded.read(), 'Save Project')
})
