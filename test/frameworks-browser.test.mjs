import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import keyless from '../dist/esm/unplugin/vite.js'
import { findBrowser } from './helpers/browser.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')
const PKG = path.resolve(HERE, '..')
const BROWSER = findBrowser()

test('React and Vue mount in a real browser and follow locale changes', { timeout: 120_000 }, async (t) => {
  if (!BROWSER) {
    t.skip('no Chromium-based browser found (set SOURCE_I18N_BROWSER)')
    return
  }

  const dir = path.join(ROOT, `frameworks-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })

  // Resolve the real package (exports map) instead of aliasing to a file.
  fs.symlinkSync(PKG, path.join(dir, 'node_modules/source-i18n'), process.platform === 'win32' ? 'junction' : 'dir')

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <div id="react-root"></div><div id="vue-root"></div>
    <script type="module" src="/src/react.js"></script>
    <script type="module" src="/src/vue.js"></script>
    </body></html>`,
  )

  fs.writeFileSync(
    path.join(dir, 'src/react.js'),
    `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { setLocale } from 'source-i18n'
import { useT } from 'source-i18n/react'

window.__setLocale = setLocale

function App() {
  const t = useT()
  return createElement('div', { id: 'react' }, t('保存项目'))
}

createRoot(document.getElementById('react-root')).render(createElement(App))
`,
  )

  fs.writeFileSync(
    path.join(dir, 'src/vue.js'),
    `import { createApp, defineComponent, h } from 'vue'
import { createI18nPlugin, useT } from 'source-i18n/vue'

const App = defineComponent({
  setup() {
    const t = useT()
    return () => h('div', { id: 'vue' }, t('保存项目'))
  },
})

createApp(App).use(createI18nPlugin()).mount('#vue-root')
`,
  )

  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: 'Save Project' } }),
  )
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default { source: 'zh-CN', locales: ['en-US'], provider: 'manual' }\n`,
  )

  const server = await createServer({
    root: dir,
    configFile: false,
    logLevel: 'error',
    plugins: [keyless({ root: dir })],
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  const url = server.resolvedUrls.local[0]

  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  try {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(
      () =>
        document.querySelector('#react')?.textContent === '保存项目' &&
        document.querySelector('#vue')?.textContent === '保存项目',
      null,
      { timeout: 60_000 },
    )

    await page.evaluate(() => window.__setLocale('en-US'))
    await page.waitForFunction(
      () =>
        document.querySelector('#react')?.textContent === 'Save Project' &&
        document.querySelector('#vue')?.textContent === 'Save Project',
      null,
      { timeout: 60_000 },
    )

    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.close()
  }
})
