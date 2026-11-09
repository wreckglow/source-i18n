import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatMessage, placeholdersOf } from '../dist/esm/format.js'
import { normalizeCatalogFile } from '../dist/esm/catalog.js'
import { resolveConfig } from '../dist/esm/config.js'
import { readCatalog } from '../dist/esm/node/catalog-io.js'
import { collectSources } from '../dist/esm/node/sources.js'
import { extractMessages } from '../dist/esm/node/extract.js'
import { formatProject } from '../dist/esm/node/normalize.js'
import { sync } from '../dist/esm/node/sync.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function workspace(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  return dir
}

/* ------------------------------------------------------------------ files */

test('catalogs with a UTF-8 BOM still load', () => {
  const dir = workspace('bom')
  const file = path.join(dir, 'i18n/locales/en-US.json')
  fs.writeFileSync(file, '\uFEFF{"locale":"en-US","messages":{"保存":"Save"}}')

  assert.deepEqual(readCatalog(file, 'en-US'), { 保存: 'Save' })
  assert.deepEqual(normalizeCatalogFile('\uFEFF{"a":"A"}').messages, { a: 'A' })
})

test('CRLF files and duplicate keys are tolerated', () => {
  const dir = workspace('crlf')
  const file = path.join(dir, 'i18n/locales/en-US.json')
  fs.writeFileSync(file, '\r\n{ "messages": { "a": "first", "a": "second" } }\r\n')

  assert.deepEqual(readCatalog(file, 'en-US'), { a: 'second' })
})

test('an empty catalog file fails with a message that names the file', () => {
  const dir = workspace('empty')
  const file = path.join(dir, 'i18n/locales/en-US.json')
  fs.writeFileSync(file, '')

  assert.throws(() => readCatalog(file, 'en-US'), /could not read .*en-US\.json/)
})

/* ----------------------------------------------------------------- config */

test('locale tags that would escape the catalog directory are rejected', () => {
  assert.throws(
    () => resolveConfig({ source: 'zh-CN', locales: ['../../etc/passwd'] }, '/tmp'),
    /invalid target locale tag/,
  )
  assert.throws(() => resolveConfig({ source: '../x', locales: ['en-US'] }, '/tmp'), /invalid source locale tag/)
  assert.throws(() => resolveConfig({ source: 'zh CN', locales: ['en-US'] }, '/tmp'), /invalid source locale tag/)
})

test('tags are canonicalised, deduplicated and still accepted', () => {
  const config = resolveConfig({ source: 'zh_hant', locales: ['en_us', 'EN-us'] }, '/tmp')
  assert.equal(config.source, 'zh-Hant')
  assert.deepEqual(config.locales, ['en-US'])
})

/* --------------------------------------------------------------- formatter */

test('a malformed locale falls back to English instead of leaving the template raw', () => {
  assert.equal(formatMessage('{n, number}', { n: 1234.5 }, 'en_US'), '1,234.5')
  assert.equal(formatMessage('{d, date}', { d: new Date('2024-01-01T00:00:00Z') }, 'x!'), 'Jan 1, 2024')
})

test('invalid parameter types never throw', () => {
  assert.equal(formatMessage('{n, number}', { n: Number.NaN }, 'en-US'), 'NaN')
  assert.equal(formatMessage('{d, date}', { d: 'not a date' }, 'en-US'), 'not a date')
  assert.equal(formatMessage('{n, plural, other {#}}', { n: Infinity }, 'en-US'), '{n}')
  assert.equal(formatMessage('{x}', { x: { nested: true } }, 'en-US'), '[object Object]')
})

test('deeply nested plurals format without blowing the stack', () => {
  let message = '{n, plural, other {#}}'
  for (let i = 0; i < 40; i += 1) message = `{n, plural, other {${message}}}`

  const output = formatMessage(message, { n: 7 }, 'en-US')
  assert.equal(output, '7')
})

test('very long messages survive', () => {
  const long = 'x'.repeat(100_000) + '{n}'
  const output = formatMessage(long, { n: 1 }, 'en-US')
  assert.equal(output.length, 100_001)
  assert.ok(output.endsWith('1'))
})

test('random templates never throw', () => {
  let seed = 42
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const alphabet = "{}'#,abcdefghijklmnopqrstuvwxyz0123456789 <>%=+/*-_\n"

  for (let i = 0; i < 500; i += 1) {
    let template = ''
    const length = Math.floor(random() * 40)
    for (let k = 0; k < length; k += 1) template += alphabet[Math.floor(random() * alphabet.length)]
    assert.equal(typeof formatMessage(template, { n: 1, a: 'x' }, 'en-US'), 'string')
    assert.equal(typeof placeholdersOf(template), 'object')
  }
})

/* ----------------------------------------------------------------- scanner */

const scan = (body) => extractMessages(`import { t } from 'source-i18n'\n${body}`, { file: 'a.ts' })

test('literal concatenation is folded, mixed concatenation stays dynamic', () => {
  const folded = scan(`t('a' + 'b')`)
  assert.deepEqual(
    folded.messages.map((m) => m.source),
    ['ab'],
  )
  assert.equal(folded.dynamic.length, 0)

  const mixed = scan(`t('a' + name)`)
  assert.equal(mixed.messages.length, 0)
  assert.equal(mixed.dynamic.length, 1)
})

test('optional calls and generic calls are extracted', () => {
  const result = scan(`t?.('可选')\nt<string>('泛型')`)
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['可选', '泛型'],
  )
})

test('truncated input never throws', () => {
  for (const code of ['t(', 't("unterminated', '/* never closed', '`${`${`x`}`}`', 't(`a${', '<>']) {
    assert.doesNotThrow(() => scan(code))
  }
})

test('random source files never throw', () => {
  let seed = 7
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const alphabet = "t(){}[]'\"`/\\*+=- \n abc123${}"

  for (let i = 0; i < 300; i += 1) {
    let code = "import { t } from 'source-i18n'\n"
    const length = Math.floor(random() * 60)
    for (let k = 0; k < length; k += 1) code += alphabet[Math.floor(random() * alphabet.length)]
    assert.doesNotThrow(() => extractMessages(code, { file: 'fuzz.ts' }))
  }
})

/* --------------------------------------------------------------- scale */

test('2,000 strings are extracted in reasonable time', () => {
  const body = Array.from({ length: 2000 }, (_, i) => `export const s${i} = t('文案${i}')`).join('\n')
  const code = `import { t } from 'source-i18n'\n${body}`

  const started = Date.now()
  const result = extractMessages(code, { file: 'big.ts' })
  const elapsed = Date.now() - started

  assert.equal(result.messages.length, 2000)
  assert.ok(elapsed < 3000, `extraction took ${elapsed}ms`)
})

test('a 10,000 entry catalog loads and normalises quickly', () => {
  const dir = workspace('large')
  const messages = {}
  for (let i = 0; i < 10_000; i += 1) messages[`key-${i}`] = `value ${i}`
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', messages }),
  )

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'] }, dir)
  const started = Date.now()
  const report = formatProject({ root: dir, config })
  const elapsed = Date.now() - started

  assert.equal(report.changed, 1)
  assert.ok(elapsed < 3000, `format took ${elapsed}ms`)
})

test('folders named "checkout-service" are scanned, not skipped by the "out" rule', () => {
  // The workspace name contains "out"; a substring-based exclude would skip it.
  const dir = workspace('checkout-service')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/app.ts'), `import { t } from 'source-i18n'\nexport const a = t('保存项目')`)

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const index = collectSources(dir, config)

  assert.equal(index.files, 1)
  assert.equal(index.messages.size, 1)
})

test('a segment in exclude still skips that folder', () => {
  const dir = workspace('exclude-segment')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src/generated'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/app.ts'), `import { t } from 'source-i18n'\nexport const a = t('保留')`)
  fs.writeFileSync(path.join(dir, 'src/generated/gen.ts'), `import { t } from 'source-i18n'\nexport const b = t('跳过')`)

  const config = resolveConfig(
    { source: 'zh-CN', locales: ['en-US'], provider: 'manual', extract: { exclude: ['generated'] } },
    dir,
  )
  const index = collectSources(dir, config)

  assert.equal(index.files, 1)
  assert.deepEqual([...index.messages.keys()], ['保留'])
})

test('non-ASCII folder and file names are scanned', () => {
  const dir = workspace('unicode-names')
  fs.mkdirSync(path.join(dir, 'src/组件'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'src/组件/首页.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('你好')`,
  )

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const index = collectSources(dir, config)

  assert.equal(index.messages.size, 1)
  assert.equal(index.messages.get('你好').file, 'src/组件/首页.ts')
})

test('GBK sources are skipped and reported instead of producing mojibake keys', () => {
  const dir = workspace('gbk')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  const prefix = Buffer.from("import { t } from 'source-i18n'\nexport const a = t('", 'utf8')
  const gbk = Buffer.from([0xb1, 0xa3, 0xb4, 0xe6]) // "保存" encoded as GBK
  fs.writeFileSync(path.join(dir, 'src/app.ts'), Buffer.concat([prefix, gbk, Buffer.from("')\n")]))

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const index = collectSources(dir, config)

  assert.equal(index.messages.size, 0, 'no mojibake keys are extracted')
  assert.equal(index.skipped.length, 1)
  assert.equal(index.skipped[0].file, 'src/app.ts')
  assert.match(index.skipped[0].reason, /UTF-8/)
})

/* --------------------------------------------------------------- provider */

test('a hanging provider times out instead of hanging sync forever', async () => {
  const dir = workspace('timeout')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/app.ts'), `import { t } from 'source-i18n'\nexport const a = t('保存项目')`)

  const config = resolveConfig(
    {
      source: 'zh-CN',
      locales: ['en-US'],
      provider: { name: 'openai', apiKey: 'fake', baseURL: 'http://127.0.0.1:9/v1' },
      providerTimeout: 80,
    },
    dir,
  )

  const original = globalThis.fetch
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      // A real hung request keeps the event loop alive via its socket; the mock
      // needs a ref'd timer for the same reason.
      const keepAlive = setTimeout(() => {}, 30_000)
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(keepAlive)
        reject(new Error('aborted by timeout'))
      })
    })

  const started = Date.now()
  try {
    const report = await sync({ root: dir, config })
    const elapsed = Date.now() - started

    assert.ok(elapsed < 3000, `sync took ${elapsed}ms`)
    assert.equal(report.locales[0].missing, 1)
    assert.equal(report.locales[0].issues[0].kind, 'provider')
  } finally {
    globalThis.fetch = original
  }
})

test('a project with no strings does not crash', async () => {
  const dir = workspace('empty-project')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/empty.ts'), `export const x = 1`)

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const report = await sync({ root: dir, config })

  assert.equal(report.sources, 0)
  assert.equal(report.locales[0].missing, 0)
})
