import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup } from 'rollup'
import { configure } from '../dist/esm/index.js'
import keyless from '../dist/esm/unplugin/rollup.js'
import { Engine } from '../dist/esm/unplugin/engine.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')
const RUNTIME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/esm/index.js')

const alias = {
  name: 'alias',
  resolveId(id) {
    return id === 'source-i18n' ? RUNTIME : null
  },
}

async function build(dir, entry, output, engine) {
  const bundle = await rollup({
    input: entry,
    plugins: [alias, keyless({ root: dir, engine })],
    onwarn() {},
  })
  const { output: chunks } = await bundle.generate({ format: 'es' })
  fs.writeFileSync(output, chunks[0].code)
  await bundle.close()
}

test('dev loop: missing string -> translate -> UI updates -> persisted for the next load', async () => {
  const dir = path.join(ROOT, `loop-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })

  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: {
    name: 'fake',
    translate: async (req) => Object.fromEntries(req.items.map((item) => [item.id, 'MT:' + item.text])),
  },
  dev: { autoTranslate: true },
}
`,
  )

  // A catalog that already has one string, but not the one we render.
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 已有: 'Existing' } }),
  )

  fs.writeFileSync(
    path.join(dir, 'src/app.js'),
    `import { t, setLocale, subscribe } from 'source-i18n'
export { setLocale, subscribe }
export const read = () => t('新文案')
export const readExisting = () => t('已有')
`,
  )

  // One engine for both the bundle (token in the virtual module) and the server.
  const engine = new Engine({ root: dir })
  const entry = path.join(dir, 'src/app.js')
  const first = path.join(dir, 'bundle-1.mjs')
  await build(dir, entry, first, engine)

  // --- dev server ---
  const stack = []
  engine.attachMiddleware({ use: (fn) => stack.push(fn) })
  const server = createServer((req, res) => {
    let index = 0
    const next = () => {
      const fn = stack[index++]
      if (fn) fn(req, res, next)
      else {
        res.statusCode = 404
        res.end('not found')
      }
    }
    next()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`

  // --- browser-ish environment ---
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  globalThis.window = globalThis
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' && input.startsWith('/') ? origin + input : input
    return previousFetch(url, init)
  }

  try {
    const page = await import(pathToFileURL(first).href)
    page.setLocale('en-US')

    // 1. already translated
    assert.equal(page.readExisting(), 'Existing')

    // 2. not translated yet: shows the source text (never a key, never blank)
    assert.equal(page.read(), '新文案')

    // 3. the dev server fills it in and the UI updates
    const deadline = Date.now() + 5000
    while (page.read() === '新文案' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(page.read(), 'MT:新文案')

    // 4. written back to the catalog
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8'))
    assert.equal(catalog.messages['新文案'], 'MT:新文案')

    // 5. "reload": a fresh bundle already contains the translation, no network needed
    const second = path.join(dir, 'bundle-2.mjs')
    await build(dir, entry, second, engine)
    const reloaded = await import(pathToFileURL(second).href)
    reloaded.setLocale('en-US')
    assert.equal(reloaded.read(), 'MT:新文案')
  } finally {
    globalThis.window = previousWindow
    globalThis.fetch = previousFetch
    configure({ sourceLocale: 'en', locale: 'en', storage: null })
    await new Promise((resolve) => server.close(resolve))
  }
})
