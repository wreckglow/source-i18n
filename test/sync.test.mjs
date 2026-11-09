import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../dist/esm/config.js'
import { sync } from '../dist/esm/node/sync.js'
import { checkProject } from '../dist/esm/node/check.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function project(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  return dir
}

function providerWith(translate) {
  return {
    name: 'fake',
    async translate(req) {
      const out = {}
      for (const item of req.items) out[item.id] = translate(item.text, req)
      return out
    },
  }
}

const defaultProvider = () => providerWith((text) => `EN:${text}`)

function readCatalog(dir, locale = 'en-US') {
  return JSON.parse(fs.readFileSync(path.join(dir, 'i18n/locales', `${locale}.json`), 'utf8'))
}

function setup(name, body) {
  const dir = project(name)
  fs.writeFileSync(path.join(dir, 'src/app.ts'), `import { t } from 'source-i18n'\n${body}\n`)
  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  return { dir, config }
}

test('sync extracts and fills a catalog', async () => {
  const { dir, config } = setup(
    'sync-fill',
    `export const a = t('保存项目')\nexport const b = t('已导出 {count} 个文件', { count: 1 })`,
  )

  const report = await sync({ root: dir, config, provider: defaultProvider() })
  assert.equal(report.sources, 2)
  assert.equal(report.locales[0].translated, 2)
  assert.equal(report.locales[0].missing, 0)

  const catalog = readCatalog(dir)
  assert.equal(catalog.messages['保存项目'], 'EN:保存项目')
  assert.equal(catalog.messages['已导出 {count} 个文件'], 'EN:已导出 {count} 个文件')
  assert.equal(catalog.sourceLocale, 'zh-CN')
})

test('human edits survive --force, machine output does not', async () => {
  const { dir, config } = setup('sync-human', `export const a = t('保存项目')\nexport const b = t('导出')`)

  await sync({ root: dir, config, provider: defaultProvider() })

  const file = path.join(dir, 'i18n/locales/en-US.json')
  const edited = readCatalog(dir)
  edited.messages['保存项目'] = 'Save Project' // a human fixed the wording
  fs.writeFileSync(file, JSON.stringify(edited, null, 2))

  await sync({ root: dir, config, provider: providerWith((text) => `EN2:${text}`), force: true })

  const catalog = readCatalog(dir)
  assert.equal(catalog.messages['保存项目'], 'Save Project')
  assert.equal(catalog.messages['导出'], 'EN2:导出')
})

test('dry run reports work without touching files', async () => {
  const { dir, config } = setup('sync-dry', `export const a = t('保存项目')`)
  const report = await sync({ root: dir, config, provider: defaultProvider(), dryRun: true })

  assert.equal(report.dryRun, true)
  assert.equal(report.locales[0].issues.length, 1)
  assert.equal(fs.existsSync(path.join(dir, 'i18n/locales/en-US.json')), false)
})

test('prune drops translations whose source disappeared', async () => {
  const { dir, config } = setup('sync-prune', `export const a = t('保存项目')\nexport const b = t('导出')`)
  await sync({ root: dir, config, provider: defaultProvider() })
  assert.equal(Object.keys(readCatalog(dir).messages).length, 2)

  fs.writeFileSync(path.join(dir, 'src/app.ts'), `import { t } from 'source-i18n'\nexport const a = t('保存项目')`)
  await sync({ root: dir, config, provider: defaultProvider(), prune: true })

  assert.deepEqual(Object.keys(readCatalog(dir).messages), ['保存项目'])
})

test('translation memory reuses the translation of an edited source', async () => {
  const { dir, config } = setup('sync-tm', `export const a = t('已导出 {count} 个文件')`)
  await sync({ root: dir, config, provider: defaultProvider() })

  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('已导出 {count} 个文档')`,
  )
  const report = await sync({
    root: dir,
    config,
    provider: providerWith((text) => `NEW:${text}`),
  })

  const catalog = readCatalog(dir)
  assert.equal(report.locales[0].fromMemory, 1)
  assert.equal(report.locales[0].translated, 0)
  assert.equal(catalog.messages['已导出 {count} 个文档'], 'EN:已导出 {count} 个文件')
})

test('translations that lose a placeholder are rejected', async () => {
  const { dir, config } = setup('sync-invalid', `export const a = t('已导出 {count} 个文件')`)

  const report = await sync({
    root: dir,
    config,
    provider: providerWith(() => '文件已导出'),
  })

  assert.equal(report.locales[0].missing, 1)
  assert.equal(report.locales[0].issues[0].kind, 'placeholders')
  assert.equal(fs.existsSync(path.join(dir, 'i18n/locales/en-US.json')), false)
})

test('check fails on missing strings and passes once translated', async () => {
  const { dir, config } = setup('check', `export const a = t('保存项目')`)

  const before = checkProject({ root: dir, config })
  assert.equal(before.ok, false)
  assert.equal(before.locales[0].missing.length, 1)
  assert.equal(before.locales[0].missing[0].file, 'src/app.ts')

  await sync({ root: dir, config, provider: defaultProvider() })

  const after = checkProject({ root: dir, config })
  assert.equal(after.ok, true)
  assert.equal(after.locales[0].missing.length, 0)
})

test('check reports unused entries and strict mode fails on them', async () => {
  const { dir, config } = setup('check-unused', `export const a = t('保存项目')`)
  await sync({ root: dir, config, provider: defaultProvider() })

  fs.writeFileSync(path.join(dir, 'src/app.ts'), `export const a = 1`)
  const normal = checkProject({ root: dir, config })
  assert.equal(normal.ok, true)
  assert.equal(normal.locales[0].unused.length, 1)

  const strict = checkProject({ root: dir, config, strict: true })
  assert.equal(strict.ok, false)
})

test('check treats identical strings as advice, not a strict failure', async () => {
  const { dir, config } = setup('check-identical', `export const a = t('TTS')`)
  await sync({ root: dir, config, provider: defaultProvider() })

  // Replace the machine translation with the source text, like a brand name.
  const file = path.join(dir, 'i18n/locales/en-US.json')
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  catalog.messages['TTS'] = 'TTS'
  fs.writeFileSync(file, JSON.stringify(catalog))

  const strict = checkProject({ root: dir, config, strict: true })
  assert.equal(strict.ok, true, JSON.stringify(strict.locales[0]))
  assert.equal(strict.locales[0].identical.length, 1, 'still reported')
})

test('check only calls untouched machine entries unused', async () => {
  const { dir, config } = setup('check-unused-provenance', `export const a = t('保存项目')`)
  await sync({ root: dir, config, provider: defaultProvider() })

  // A human-added fragment with no provenance record must not fail strict.
  const file = path.join(dir, 'i18n/locales/en-US.json')
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  catalog.messages['手动补的短词'] = 'Manually added'
  fs.writeFileSync(file, JSON.stringify(catalog))

  const strict = checkProject({ root: dir, config, strict: true })
  assert.equal(strict.ok, true, JSON.stringify(strict.locales[0]))
  assert.equal(strict.locales[0].unused.length, 0)

  // Remove the source of the machine entry: now it is provably stale.
  fs.writeFileSync(path.join(dir, 'src/app.ts'), `export const other = 1`)
  const stale = checkProject({ root: dir, config, strict: true })
  assert.equal(stale.ok, false)
  assert.deepEqual(stale.locales[0].unused, ['保存项目'])
})

test('prune keeps human edits and manual fragments', async () => {
  const { dir, config } = setup('prune-safe', `export const a = t('保存项目')`)
  await sync({ root: dir, config, provider: defaultProvider() })

  const file = path.join(dir, 'i18n/locales/en-US.json')
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  catalog.messages['保存项目'] = 'Save (edited by a human)'
  catalog.messages['手动补的词'] = 'Manual'
  fs.writeFileSync(file, JSON.stringify(catalog))

  const report = await sync({ root: dir, config, provider: defaultProvider(), prune: true })

  const after = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(after.messages['手动补的词'], 'Manual', 'manual fragment survives')
  assert.equal(after.messages['保存项目'], 'Save (edited by a human)', 'human edit survives')
  assert.equal(report.locales[0].pruned, 0)
})

test('strict check fails on dynamic t() calls', () => {
  const dir = project('check-dynamic')
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'
const label = 'x'
export const a = t('保存项目')
export const b = t(label)
`,
  )
  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)

  const normal = checkProject({ root: dir, config })
  assert.equal(normal.ok, false, 'missing translation still fails')
  assert.equal(normal.dynamic.length, 1)

  // Even with every string translated, strict rejects the dynamic call.
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: 'Save' } }),
  )
  const strict = checkProject({ root: dir, config, strict: true })
  assert.equal(strict.ok, false)

  const lenient = checkProject({ root: dir, config })
  assert.equal(lenient.ok, true)
})

test('check reports short keys and multi-placeholder sentences as advice', () => {
  const dir = project('check-advice')
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'
export const a = t('人')
export const b = t('{count} 行')
export const c = t('{inputs} 个输入 / {outputs} 个输出')
`,
  )
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({
      locale: 'en-US',
      sourceLocale: 'zh-CN',
      messages: {
        人: 'People',
        '{count} 行': '{count} lines',
        '{inputs} 个输入 / {outputs} 个输出': '{inputs} inputs / {outputs} outputs',
      },
    }),
  )
  const config = resolveConfig(
    {
      source: 'zh-CN',
      locales: ['en-US'],
      provider: 'manual',
      plural: { placeholders: ['count', 'inputs', 'outputs'] },
    },
    dir,
  )

  const report = checkProject({ root: dir, config })
  assert.equal(report.ok, true, 'advice never fails')
  assert.deepEqual(
    report.short.map((item) => item.source),
    ['人'],
  )
  assert.equal(report.plural.length, 1)
  assert.deepEqual(report.plural[0].placeholders, ['inputs', 'outputs'])
})

test('an identical Chinese string in an English catalog is a failure', () => {
  const dir = project('check-identical-script')
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('保存项目')`,
  )
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: '保存项目' } }),
  )
  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)

  const report = checkProject({ root: dir, config, strict: true })
  assert.equal(report.ok, false)
  assert.equal(report.locales[0].invalid[0].kind, 'untranslated-script')
})

test('manual orphans are reported and only removed with pruneManual', async () => {
  const { dir, config } = setup('prune-manual', `export const a = t('保存项目')`)
  await sync({ root: dir, config, provider: defaultProvider() })

  const file = path.join(dir, 'i18n/locales/en-US.json')
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  catalog.messages['手动补的词'] = 'Manual'
  fs.writeFileSync(file, JSON.stringify(catalog))

  const report = checkProject({ root: dir, config, strict: true })
  assert.equal(report.ok, true, 'manual entries never fail strict')
  assert.deepEqual(report.locales[0].manual, ['手动补的词'])

  await sync({ root: dir, config, provider: defaultProvider(), prune: true })
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).messages['手动补的词'], 'Manual')

  await sync({ root: dir, config, provider: defaultProvider(), prune: true, pruneManual: true })
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).messages['手动补的词'], undefined)
})

test('requireImport: false extracts wrapper modules', () => {
  const dir = project('require-import')
  fs.writeFileSync(
    path.join(dir, 'src/wrapper.ts'),
    `const t = (s: string) => s\nexport const a = t('保存项目')`,
  )
  const strictConfig = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
  const looseConfig = resolveConfig(
    { source: 'zh-CN', locales: ['en-US'], provider: 'manual', extract: { requireImport: false } },
    dir,
  )

  assert.equal(checkProject({ root: dir, config: strictConfig }).sources, 0)
  assert.equal(checkProject({ root: dir, config: looseConfig }).sources, 1)
})

test('sync reports sentences with several numeric placeholders', async () => {
  const dir = project('sync-plural-risk')
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('{inputs} 个输入 / {outputs} 个输出')`,
  )
  const config = resolveConfig(
    {
      source: 'zh-CN',
      locales: ['en-US'],
      provider: 'manual',
      plural: { placeholders: ['inputs', 'outputs'] },
    },
    dir,
  )

  const report = await sync({ root: dir, config, provider: defaultProvider() })
  assert.equal(report.plural.length, 1)
  assert.deepEqual(report.plural[0].placeholders, ['inputs', 'outputs'])
})

test('catalogs are written with stable, sorted formatting', async () => {
  const { dir, config } = setup(
    'sync-format',
    `export const a = t('b')\nexport const b = t('a')`,
  )
  await sync({ root: dir, config, provider: defaultProvider() })
  const raw = fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8')
  assert.ok(raw.indexOf('"a"') < raw.indexOf('"b"'))
  assert.ok(raw.endsWith('\n'))
  assert.ok(raw.includes('  "locale": "en-US"'))
})
