import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer, request } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Engine, RESOLVED_VIRTUAL_ID, VIRTUAL_ID } from '../dist/esm/unplugin/engine.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function project(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: {
    name: 'fake',
    translate: async (req) => Object.fromEntries(req.items.map((item) => [item.id, 'EN:' + item.text])),
  },
  dev: { autoTranslate: true },
}
`,
  )
  return dir
}

test('moves the import to the end to preserve line numbers', async () => {
  const dir = project('engine-transform')
  const engine = new Engine({ root: dir })
  const code = `import { t } from 'source-i18n'\nexport const a = t('保存项目')`
  const output = await engine.transform(code, path.join(dir, 'src/app.ts'))

  assert.ok(output.startsWith(code), 'original code is untouched')
  assert.ok(output.includes(`import { __keylessInit } from "${VIRTUAL_ID}";`))
  assert.ok(output.trimEnd().endsWith('__keylessInit();'))
  assert.equal(output.split('\n')[0], "import { t } from 'source-i18n'")
})

test('ignores modules that do not import the runtime', async () => {
  const dir = project('engine-skip')
  const engine = new Engine({ root: dir })
  assert.equal(await engine.transform(`const a = t('x')`, path.join(dir, 'src/a.ts')), null)
  assert.equal(await engine.transform(`import { t } from 'source-i18n'`, path.join(dir, 'node_modules/x/a.js')), null)
})

test('never touches raw SFC sources', async () => {
  const dir = project('engine-sfc')
  const engine = new Engine({ root: dir })

  const sfc = `<script setup>
import { t } from 'source-i18n'
const a = t('保存项目')
</script>

<template><div>{{ a }}</div></template>
`
  assert.equal(await engine.transform(sfc, path.join(dir, 'src/App.vue')), null)

  const compiled = `import { t } from 'source-i18n'\nexport default { setup: () => () => t('保存项目') }`
  const output = await engine.transform(compiled, path.join(dir, 'src/App.vue?vue&type=script'))
  assert.match(output, /virtual:source-i18n\/messages/)
})

test('serves catalogs through the virtual module', async () => {
  const dir = project('engine-load')
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: 'Save Project' } }),
  )
  const engine = new Engine({ root: dir })
  const module = await engine.load(RESOLVED_VIRTUAL_ID)

  assert.match(module, /registerCatalogs/)
  assert.match(module, /"保存项目":"Save Project"/)
  assert.match(module, /sourceLocale: "zh-CN"/)
  assert.match(module, /x-source-i18n-token/)
  assert.match(module, /setWarnOnMissing\(true\)/, 'dev modules warn about missing strings')
  assert.ok(module.includes(engine.devToken), 'the dev token is sent with requests')
  assert.equal(await engine.load('other'), undefined)
})

test('warns once about dynamic t() calls', async () => {
  const dir = project('engine-dynamic')
  const engine = new Engine({ root: dir })
  const code = `import { t } from 'source-i18n'\nconst label = 'a'\nexport const a = t(label)`

  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    await engine.transform(code, path.join(dir, 'src/app.ts'))
    await engine.transform(code, path.join(dir, 'src/app.ts'))
  } finally {
    console.warn = original
  }

  assert.equal(warnings.length, 1, 'warned once, not on every rebuild')
  assert.match(warnings[0], /dynamic t\(\) call at src\/app\.ts:\d+/)
})

test('resolves the virtual id', () => {
  const engine = new Engine()
  assert.equal(engine.resolveId(VIRTUAL_ID), RESOLVED_VIRTUAL_ID)
  assert.equal(engine.resolveId('nothing'), undefined)
})

function gateProject(name, onBuild, messages) {
  const dir = project(name)
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: 'manual',
  check: { onBuild: '${onBuild}' },
}
`,
  )
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('保存项目')`,
  )
  if (messages) {
    fs.writeFileSync(
      path.join(dir, 'i18n/locales/en-US.json'),
      JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages }),
    )
  }
  return dir
}

test('buildGate is off by default', async () => {
  const dir = gateProject('gate-off', 'off')
  const engine = new Engine({ root: dir })
  engine.setDev(false)
  assert.equal(await engine.buildGate(), undefined)
})

test('buildGate returns a failure message when translations are missing', async () => {
  const dir = gateProject('gate-error', 'error')
  const engine = new Engine({ root: dir })
  engine.setDev(false)
  assert.match(await engine.buildGate(), /check failed: 1 missing/)
})

test('buildGate can warn instead of failing', async () => {
  const dir = gateProject('gate-warn', 'warn')
  const engine = new Engine({ root: dir })
  engine.setDev(false)

  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    await engine.buildGate()
  } finally {
    console.warn = original
  }

  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /check failed: 1 missing/)
})

test('buildGate passes with a complete catalog', async () => {
  const dir = gateProject('gate-ok', 'error', { 保存项目: 'Save project' })
  const engine = new Engine({ root: dir })
  engine.setDev(false)
  assert.equal(await engine.buildGate(), undefined)
})

test('buildGate never runs in dev', async () => {
  const dir = gateProject('gate-dev', 'error')
  const engine = new Engine({ root: dir })
  engine.setDev(true)
  assert.equal(await engine.buildGate(), undefined)
})

test('setRoot adopts the bundler root when no explicit root is given', async () => {
  const dir = gateProject('gate-root', 'error', { 保存项目: 'Save project' })
  const engine = new Engine()
  engine.setRoot(dir)
  engine.setDev(false)
  assert.equal(await engine.buildGate(), undefined)
})

test('production builds contain no dev endpoint at all', async () => {
  const dir = project('engine-prod')
  const engine = new Engine({ root: dir })
  engine.setDev(false)

  const module = await engine.load(RESOLVED_VIRTUAL_ID)
  assert.doesNotMatch(module, /fetch\(/)
  assert.doesNotMatch(module, /x-source-i18n-token/)
  assert.doesNotMatch(module, /__source-i18n/)
  assert.doesNotMatch(module, /setWarnOnMissing/)
  assert.match(module, /registerCatalogs/)
})

test('dev auto-translate is opt-in', async () => {
  const dir = project('engine-optin')
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default { source: 'zh-CN', locales: ['en-US'], provider: 'manual' }\n`,
  )
  const engine = new Engine({ root: dir })

  const module = await engine.load(RESOLVED_VIRTUAL_ID)
  assert.doesNotMatch(module, /setMissingHandler/)
  assert.doesNotMatch(module, /x-source-i18n-token/)
  assert.doesNotMatch(module, /fetch\(/)
  assert.match(module, /setWarnOnMissing/, 'dev still warns about missing strings')
})

function post(port, body, headers = {}) {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/__source-i18n/translate',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

test('dev endpoint: translates, writes back and rejects unsafe callers', async () => {
  const dir = project('engine-dev')
  const engine = new Engine({ root: dir })

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
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  try {
    // happy path: same-origin + token
    const ok = await post(port, { source: '新文案', locale: 'en-US' }, { 'x-source-i18n-token': engine.devToken })
    assert.equal(ok.status, 200)
    assert.deepEqual(JSON.parse(ok.body), { id: '新文案', text: 'EN:新文案' })

    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8'))
    assert.equal(catalog.messages['新文案'], 'EN:新文案')

    // an explicit same-origin header is fine
    const withOrigin = await post(
      port,
      { source: '再次', locale: 'en-US' },
      { 'x-source-i18n-token': engine.devToken, origin },
    )
    assert.equal(withOrigin.status, 200)

    // no token: a random website cannot spend API credits
    assert.equal((await post(port, { source: 'x', locale: 'en-US' })).status, 403)

    // wrong token
    const wrong = await post(port, { source: 'x', locale: 'en-US' }, { 'x-source-i18n-token': 'nope' })
    assert.equal(wrong.status, 403)

    // cross-site fetch metadata
    const crossSite = await post(
      port,
      { source: 'x', locale: 'en-US' },
      { 'x-source-i18n-token': engine.devToken, 'sec-fetch-site': 'cross-site' },
    )
    assert.equal(crossSite.status, 403)

    // a different origin (CSRF)
    const foreignOrigin = await post(
      port,
      { source: 'x', locale: 'en-US' },
      { 'x-source-i18n-token': engine.devToken, origin: 'https://evil.example' },
    )
    assert.equal(foreignOrigin.status, 403)

    // wrong content type (also blocks simple cross-origin form posts)
    const wrongType = await post(
      port,
      { source: 'x', locale: 'en-US' },
      { 'x-source-i18n-token': engine.devToken, 'content-type': 'text/plain' },
    )
    assert.equal(wrongType.status, 415)

    assert.equal((await fetch(`${origin}/other`)).status, 404)
    assert.equal((await fetch(`${origin}/__source-i18n/translate`)).status, 405)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
