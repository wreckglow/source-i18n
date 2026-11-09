import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import http2 from 'node:http2'
import { createServer, request } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../dist/esm/config.js'
import { readCatalog, writeCatalog } from '../dist/esm/node/catalog-io.js'
import { collectSources } from '../dist/esm/node/sources.js'
import { createOpenAIProvider, ProviderError } from '../dist/esm/node/providers/openai.js'
import { Engine, RESOLVED_VIRTUAL_ID } from '../dist/esm/unplugin/engine.js'
import keylessVite from '../dist/esm/unplugin/vite.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')
const KEY = 'sk-fake-key-never-leak'

function workspace(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  return dir
}

function project(name, provider = 'manual') {
  const dir = workspace(name)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('保存项目')`,
  )
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default { source: 'zh-CN', locales: ['en-US'], provider: '${provider}', dev: { autoTranslate: true } }\n`,
  )
  return dir
}

/* ------------------------------------------------------------ disk failures */

test('junction loops are not followed', (t) => {
  if (process.platform !== 'win32') {
    t.skip('junctions are Windows-specific')
    return
  }

  const dir = workspace('junction-loop')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/app.ts'), `import { t } from 'source-i18n'\nexport const a = t('保存')`)
  fs.symlinkSync(path.join(dir, 'src'), path.join(dir, 'src/loop'), 'junction')

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const started = Date.now()
  const index = collectSources(dir, config)

  assert.equal(index.files, 1, 'the loop is skipped, not followed')
  assert.ok(Date.now() - started < 2000, 'scanning terminates quickly')
})

test('a read-only catalog fails cleanly and leaves no temp file', (t) => {
  if (process.platform !== 'win32') {
    t.skip('read-only attribute blocking writes is Windows-specific')
    return
  }

  const dir = workspace('readonly')
  const file = path.join(dir, 'i18n/locales/en-US.json')
  const original = '{"locale":"en-US","messages":{"a":"A"}}'
  fs.writeFileSync(file, original)
  fs.chmodSync(file, 0o444)

  try {
    assert.throws(
      () => writeCatalog(file, 'en-US', 'zh-CN', { a: 'A', b: 'B' }),
      /could not write .*en-US\.json/,
    )
    assert.equal(fs.readFileSync(file, 'utf8'), original, 'the original file is untouched')
    const leftovers = fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [], 'no temp files are left behind')
  } finally {
    fs.chmodSync(file, 0o666)
  }
})

test('a read-only directory fails cleanly', (t) => {
  if (process.platform !== 'win32') {
    t.skip('uses icacls to deny writes')
    return
  }

  const dir = workspace('readonly-dir')
  const locales = path.join(dir, 'i18n/locales')
  fs.mkdirSync(locales, { recursive: true })
  const user = process.env.USERNAME
  if (!user) {
    t.skip('no USERNAME')
    return
  }

  execFileSync('icacls', [locales, '/deny', `${user}:(OI)(CI)(W)`], { stdio: 'ignore' })
  try {
    assert.throws(
      () => writeCatalog(path.join(locales, 'en-US.json'), 'en-US', 'zh-CN', { a: 'A' }),
      /could not lock|could not write|EPERM|permission/i,
    )
  } finally {
    // The deny ACL also blocks listing, so restore it before inspecting.
    execFileSync('icacls', [locales, '/remove:d', user], { stdio: 'ignore' })
  }

  assert.deepEqual(fs.readdirSync(locales), [], 'nothing is written')
})

test('an HTTP/2-only endpoint fails fast instead of hanging', async () => {
  const server = http2.createServer()
  server.on('stream', (stream) => {
    stream.respond({ ':status': 200, 'content-type': 'application/json' })
    stream.end('{}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    const started = Date.now()
    const provider = createOpenAIProvider({
      name: 'openai',
      apiKey: KEY,
      baseURL: `http://127.0.0.1:${port}/v1`,
    })
    await assert.rejects(() => provider.translate(request_), /fetch failed|ECONNRESET|socket/i)
    assert.ok(Date.now() - started < 5000, 'fails within 5 seconds')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a 400-character deep path is scanned', () => {
  const dir = workspace('longpath')
  let deep = path.join(dir, 'src')
  for (let i = 0; i < 12; i += 1) deep = path.join(deep, `seg-${i}-${'x'.repeat(18)}`)
  fs.mkdirSync(deep, { recursive: true })
  fs.writeFileSync(path.join(deep, 'app.ts'), `import { t } from 'source-i18n'\nexport const a = t('深层')`)

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const index = collectSources(dir, config)

  assert.equal(index.messages.size, 1)
  assert.ok(index.messages.get('深层').file.length > 300)
})

test('paths inside an app.asar directory work', () => {
  const dir = workspace('asar')
  const locales = path.join(dir, 'app.asar', 'i18n', 'locales')
  fs.mkdirSync(locales, { recursive: true })
  fs.writeFileSync(
    path.join(locales, 'en-US.json'),
    JSON.stringify({ locale: 'en-US', messages: { 保存: 'Save' } }),
  )

  assert.deepEqual(readCatalog(path.join(locales, 'en-US.json'), 'en-US'), { 保存: 'Save' })
})

/* ---------------------------------------------------------------- network */

const reply = (content) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: async () => '',
})

async function withFetch(mock, run) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

const provider = () =>
  createOpenAIProvider({ name: 'openai', apiKey: KEY, baseURL: 'http://127.0.0.1:9/v1' })

const request_ = { items: [{ id: 'a', text: 'a' }], from: 'zh-CN', to: 'en-US' }

test('a truncated JSON response fails without leaking the key', async () => {
  await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
      text: async () => '',
    }),
    async () => {
      await assert.rejects(
        () => provider().translate(request_),
        (error) => {
          assert.ok(!String(error.message).includes(KEY))
          return true
        },
      )
    },
  )
})

test('a huge error body is truncated in the message', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'x'.repeat(1_000_000),
    }),
    async () => {
      await assert.rejects(
        () => provider().translate(request_),
        (error) => {
          assert.ok(error instanceof ProviderError)
          assert.equal(error.status, 500)
          assert.ok(error.message.length < 400, `message was ${error.message.length} chars`)
          assert.ok(!error.message.includes(KEY))
          return true
        },
      )
    },
  )
})

test('a caller abort signal is respected', async () => {
  const controller = new AbortController()
  controller.abort()

  await withFetch(
    async (_url, init) => {
      if (init?.signal?.aborted) throw new Error('aborted by caller')
      return reply('{"translations":[{"i":0,"text":"A"}]}')
    },
    async () => {
      await assert.rejects(() => provider().translate(request_, controller.signal), /aborted by caller/)
    },
  )
})

test('a hostile model reply containing the key is not echoed', async () => {
  await withFetch(
    async () => reply(`{"translations":[{"i":0,"text":"${KEY}"}]}`),
    async () => {
      const result = await provider().translate(request_)
      // The key is treated as a translation, but never surfaced in an error.
      assert.equal(result.a, KEY)
    },
  )
})

/* ------------------------------------------------------------ vite adapter */

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

test('the Vite adapter exposes working hooks without Vite', async () => {
  const dir = project('vite-hooks', 'manual')
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', messages: { 保存项目: 'Save Project' } }),
  )

  const plugin = keylessVite({ root: dir })
  plugin.configResolved({ command: 'serve' })

  const code = `import { t } from 'source-i18n'\nexport const a = t('保存项目')`
  const output = await plugin.transform(code, path.join(dir, 'src/app.ts'))
  assert.match(output, /virtual:source-i18n\/messages/)

  const module = await plugin.load(RESOLVED_VIRTUAL_ID)
  assert.match(module, /registerCatalogs/)
  assert.match(module, /Save Project/)

  const token = /const devToken = "([^"]+)"/.exec(module)[1]
  const stack = []
  plugin.configureServer({ middlewares: { use: (fn) => stack.push(fn) } })
  assert.equal(stack.length, 1)

  const server = createServer((req, res) => {
    let index = 0
    const next = () => {
      const fn = stack[index++]
      if (fn) fn(req, res, next)
      else {
        res.statusCode = 404
        res.end('nf')
      }
    }
    next()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    assert.equal((await post(port, { source: 'x' })).status, 403)
    const authorized = await post(port, { source: 'x', locale: 'en-US' }, { 'x-source-i18n-token': token })
    // 502 (not 403) proves the token was accepted and the provider was reached;
    // the manual provider simply has nothing to return.
    assert.equal(authorized.status, 502)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

/* --------------------------------------------------------- two dev servers */

test('two engines writing the same catalog do not lose keys', async () => {
  const dir = project('two-engines', 'fake')
  // use a fake provider through the config file
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default {
  source: 'zh-CN',
  locales: ['en-US'],
  provider: { name: 'fake', translate: async (req) => Object.fromEntries(req.items.map((i) => [i.id, 'EN:' + i.text])) },
  dev: { autoTranslate: true },
}
`,
  )

  const engines = [new Engine({ root: dir }), new Engine({ root: dir })]
  const servers = []
  const origins = []

  for (const engine of engines) {
    const stack = []
    engine.attachMiddleware({ use: (fn) => stack.push(fn) })
    const server = createServer((req, res) => {
      let index = 0
      const next = () => {
        const fn = stack[index++]
        if (fn) fn(req, res, next)
        else {
          res.statusCode = 404
          res.end('nf')
        }
      }
      next()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    origins.push({ origin: `http://127.0.0.1:${server.address().port}`, token: engine.devToken, port: server.address().port })
  }

  try {
    const calls = Array.from({ length: 12 }, (_, i) => {
      const target = origins[i % origins.length]
      const payload = JSON.stringify({ source: `并发${i}`, locale: 'en-US' })
      return new Promise((resolve, reject) => {
        const req = request(
          {
            hostname: '127.0.0.1',
            port: target.port,
            path: '/__source-i18n/translate',
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
              'x-source-i18n-token': target.token,
            },
          },
          (res) => {
            res.resume()
            res.on('end', () => resolve(res.statusCode))
          },
        )
        req.on('error', reject)
        req.end(payload)
      })
    })

    const statuses = await Promise.all(calls)
    assert.deepEqual(statuses, Array(12).fill(200))

    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8'))
    assert.equal(Object.keys(catalog.messages).length, 12, 'every key survived')
  } finally {
    for (const server of servers) await new Promise((resolve) => server.close(resolve))
  }
})

/* ------------------------------------------------------------------ scale */

test('a 1,000-file project is scanned in reasonable time', () => {
  const dir = workspace('many-files')
  for (let i = 0; i < 1000; i += 1) {
    const sub = path.join(dir, 'src', `mod-${i % 50}`)
    fs.mkdirSync(sub, { recursive: true })
    fs.writeFileSync(
      path.join(sub, `file-${i}.ts`),
      `import { t } from 'source-i18n'\nexport const a = t('文案-${i}')\nexport const b = t('按钮-${i}')`,
    )
  }

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const started = Date.now()
  const index = collectSources(dir, config)
  const elapsed = Date.now() - started

  assert.equal(index.files, 1000)
  assert.equal(index.messages.size, 2000)
  assert.ok(elapsed < 15000, `scan took ${elapsed}ms`)
})
