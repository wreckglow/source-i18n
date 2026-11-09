import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup } from 'rollup'
import keyless from '../dist/esm/unplugin/rollup.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')
const RUNTIME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/esm/index.js')

/** Resolves the package name to its build output, since this repo is not installed into itself. */
const alias = {
  name: 'alias-keyless',
  resolveId(id) {
    if (id === 'source-i18n') return RUNTIME
    return null
  },
}

function project(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: 'manual',
}
`,
  )
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({
      locale: 'en-US',
      sourceLocale: 'zh-CN',
      messages: { 保存项目: 'Save Project', 已导出: 'Exported', '打开@@verb': 'Open' },
    }),
  )
  return dir
}

test('rollup bundles the plugin, the virtual module and the catalogs', async () => {
  const dir = project('rollup')
  fs.writeFileSync(
    path.join(dir, 'src/app.js'),
    `import { t } from 'source-i18n'
export { setLocale, getLocale } from 'source-i18n'

export const title = () => t('保存项目')
export const status = () => t('已导出')
export const verb = () => t('打开', undefined, { context: 'verb' })
export const missing = () => t('尚未翻译')
`,
  )

  const bundle = await rollup({
    input: path.join(dir, 'src/app.js'),
    plugins: [alias, keyless({ root: dir })],
    onwarn(warning) {
      if (warning.code !== 'CIRCULAR_DEPENDENCY') throw new Error(warning.message)
    },
  })

  const { output } = await bundle.generate({ format: 'es' })
  const code = output[0].code

  assert.match(code, /registerCatalogs/)
  assert.match(code, /Save Project/)
  assert.doesNotMatch(code, /virtual:source-i18n\/messages/, 'virtual import must be resolved away')

  const file = path.join(dir, 'bundle.mjs')
  fs.writeFileSync(file, code)
  const module = await import(pathToFileURL(file).href)

  module.setLocale('en-US')
  assert.equal(module.getLocale(), 'en-US')
  assert.equal(module.title(), 'Save Project')
  assert.equal(module.status(), 'Exported')
  assert.equal(module.verb(), 'Open')
  assert.equal(module.missing(), '尚未翻译', 'missing strings fall back to the source text')

  await bundle.close()
})

test('the config file, including API keys, never reaches the bundle', async () => {
  const dir = project('rollup-secret')
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: { name: 'openai', apiKey: 'sk-SENTINEL-DO-NOT-LEAK', model: 'gpt-4o-mini' },
}
`,
  )
  fs.writeFileSync(
    path.join(dir, 'src/app.js'),
    `import { t } from 'source-i18n'\nexport const title = () => t('保存项目')\n`,
  )

  const bundle = await rollup({
    input: path.join(dir, 'src/app.js'),
    plugins: [alias, keyless({ root: dir })],
    onwarn() {},
  })
  const { output } = await bundle.generate({ format: 'es' })
  const code = output[0].code

  assert.ok(!code.includes('SENTINEL'), 'API key leaked into the client bundle')
  assert.ok(!code.includes('apiKey'), 'provider config leaked into the client bundle')
  assert.match(code, /Save Project/, 'catalogs are still shipped')

  await bundle.close()
})

test('the runtime bundle has no node builtins', async () => {
  const dir = project('rollup-browser')
  fs.writeFileSync(
    path.join(dir, 'src/app.js'),
    `import { createI18n } from 'source-i18n'
const i18n = createI18n({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
export const title = () => i18n.t('保存项目')
`,
  )

  const bundle = await rollup({
    input: path.join(dir, 'src/app.js'),
    plugins: [alias],
    onwarn(warning) {
      throw new Error(warning.message)
    },
  })
  const { output } = await bundle.generate({ format: 'es' })
  const code = output[0].code

  assert.doesNotMatch(code, /node:/)
  assert.doesNotMatch(code, /process\.env/)

  await bundle.close()
})

test('the plugin keeps statements on their original lines', async () => {
  const dir = project('rollup-lines')
  fs.writeFileSync(
    path.join(dir, 'src/app.js'),
    `import { t } from 'source-i18n'
export const first = t('保存项目')
export const second = t('已导出')
`,
  )

  const bundle = await rollup({
    input: path.join(dir, 'src/app.js'),
    plugins: [alias, keyless({ root: dir })],
    onwarn() {},
  })
  const { output } = await bundle.generate({ format: 'es' })
  const lines = output[0].code.split('\n')

  const firstLine = lines.findIndex((line) => /const first\b/.test(line))
  const secondLine = lines.findIndex((line) => /const second\b/.test(line))
  assert.notEqual(firstLine, -1)
  assert.equal(secondLine - firstLine, 1, 'adjacent statements stay adjacent')

  await bundle.close()
})
