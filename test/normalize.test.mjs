import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../dist/esm/config.js'
import { formatProject } from '../dist/esm/node/normalize.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function project(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  return dir
}

function read(dir, name) {
  return fs.readFileSync(path.join(dir, 'i18n/locales', name), 'utf8')
}

test('resolveConfig canonicalises locale tags and removes duplicates', () => {
  const config = resolveConfig({ source: 'zh_cn', locales: ['en_us', 'en-US'] }, '/tmp')
  assert.equal(config.source, 'zh-CN')
  assert.deepEqual(config.locales, ['en-US'])
})

test('format sorts keys, fixes the locale field and renames files', () => {
  const dir = project('format')
  // deliberately messy: unsorted, wrong locale field, a number, extra fields
  fs.writeFileSync(
    path.join(dir, 'i18n/locales/en_us.json'),
    `{
  "locale": "en_us",
  "$schema": "https://example.com/schema.json",
  "custom": true,
  "messages": {
    "b": "B",
    "a": "A",
    "count": 3,
    "__proto__": "polluted"
  }
}
`,
  )

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'] }, dir)
  const report = formatProject({ root: dir, config })

  assert.equal(report.changed, 1)
  assert.equal(report.files[0].locale, 'en-US')
  assert.equal(report.files[0].renamedFrom, 'en_us.json')
  assert.equal(fs.existsSync(path.join(dir, 'i18n/locales/en_us.json')), false)

  const output = read(dir, 'en-US.json')
  assert.equal(
    output,
    `{
  "locale": "en-US",
  "sourceLocale": "zh-CN",
  "messages": {
    "a": "A",
    "b": "B"
  }
}
`,
  )
})

test('format --check reports changes without writing', () => {
  const dir = project('format-check')
  const messy = '{"locale":"en-US","messages":{"b":"B","a":"A"}}'
  fs.writeFileSync(path.join(dir, 'i18n/locales/en-US.json'), messy)

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'] }, dir)
  const report = formatProject({ root: dir, config, check: true })

  assert.equal(report.changed, 1)
  assert.equal(read(dir, 'en-US.json'), messy)
})

test('format is idempotent', () => {
  const dir = project('format-idempotent')
  fs.writeFileSync(path.join(dir, 'i18n/locales/en-US.json'), '{"messages":{"b":"B","a":"A"}}')

  const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'] }, dir)
  formatProject({ root: dir, config })
  const afterFirst = read(dir, 'en-US.json')

  const second = formatProject({ root: dir, config })
  assert.equal(second.changed, 0)
  assert.equal(read(dir, 'en-US.json'), afterFirst)
  assert.ok(afterFirst.endsWith('\n'))
})
