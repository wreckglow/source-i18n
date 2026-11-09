import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { build, createServer } from 'vite'
import keyless from '../dist/esm/unplugin/vite.js'
import { findBrowser } from './helpers/browser.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')
const RUNTIME = path.resolve(HERE, '../dist/esm/index.js')
const BROWSER = findBrowser()

function makeApp(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>`,
  )

  fs.writeFileSync(
    path.join(dir, 'src/main.js'),
    `import { t, setLocale, subscribe } from 'source-i18n'

const params = new URLSearchParams(location.search)
if (params.has('en')) setLocale('en-US')

const render = () => { document.querySelector('#app').textContent = t('新文案') }
subscribe(render)
render()
`,
  )

  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: { name: 'fake', translate: async (req) => Object.fromEntries(req.items.map((i) => [i.id, 'MT:' + i.text])) },
  dev: { autoTranslate: true },
}
`,
  )

  return dir
}

test('real Vite dev server, browser, reload and production build', { timeout: 180_000 }, async (t) => {
  if (!BROWSER) {
    t.skip('no Chromium-based browser found (set SOURCE_I18N_BROWSER)')
    return
  }

  const dir = makeApp('vite-browser')
  const shared = {
    root: dir,
    configFile: false,
    logLevel: 'error',
    resolve: { alias: { 'source-i18n': RUNTIME } },
  }

  const server = await createServer({
    ...shared,
    plugins: [keyless({ root: dir })],
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  const url = server.resolvedUrls.local[0]

  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  try {
    const served = await (await fetch(new URL('src/main.js', url))).text()
    assert.ok(served.includes('virtual:source-i18n'), 'the plugin injects the catalog import')

    await page.goto(`${url}?en=1`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#app').textContent === 'MT:新文案', null, {
      timeout: 30_000,
    })

    const catalogFile = path.join(dir, 'i18n/locales/en-US.json')
    const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
    assert.equal(catalog.messages['新文案'], 'MT:新文案')

    // Reload without the query flag: the stored locale must still win,
    // and the virtual module must not be served from a stale cache.
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('#app').textContent === 'MT:新文案', null, {
      timeout: 30_000,
    })

    assert.equal(await page.evaluate(() => localStorage.getItem('source-i18n:locale')), 'en-US')
    assert.deepEqual(consoleErrors, [])
  } finally {
    await browser.close()
    await server.close()
  }

  // Production build: no dev endpoint, no token, translations included.
  const outDir = path.join(dir, 'dist')
  await build({
    ...shared,
    plugins: [keyless({ root: dir })],
    build: { outDir, emptyOutDir: true, minify: false },
  })

  const assets = fs.readdirSync(path.join(outDir, 'assets')).filter((file) => file.endsWith('.js'))
  const bundle = assets.map((file) => fs.readFileSync(path.join(outDir, 'assets', file), 'utf8')).join('\n')

  assert.ok(bundle.includes('MT:新文案'), 'translations are bundled')
  assert.ok(!bundle.includes('__source-i18n'), 'no dev endpoint in the build')
  assert.ok(!bundle.includes('x-source-i18n-token'), 'no dev token in the build')
  assert.ok(!bundle.includes('provider'), 'no provider config in the build')
})
