import test from 'node:test'
import assert from 'node:assert/strict'
import {
  messageKey,
  splitKey,
  normalizeCatalogFile,
  stringifyCatalog,
} from '../dist/esm/catalog.js'

test('plain source text is the key', () => {
  assert.equal(messageKey('保存项目'), '保存项目')
  assert.deepEqual(splitKey('保存项目'), { source: '保存项目' })
})

test('context is appended', () => {
  assert.equal(messageKey('打开', 'verb'), '打开@@verb')
  assert.deepEqual(splitKey('打开@@verb'), { source: '打开', context: 'verb' })
})

test('literal @@ is escaped and round-trips', () => {
  const source = 'email@@example.com'
  const key = messageKey(source)
  assert.equal(key, 'email@@@@example.com')
  assert.deepEqual(splitKey(key), { source })
})

test('context with escaped source round-trips', () => {
  const key = messageKey('a@@b', 'menu')
  assert.deepEqual(splitKey(key), { source: 'a@@b', context: 'menu' })
})

test('normalizes our own format', () => {
  const file = normalizeCatalogFile(
    { locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存: 'Save' } },
    'en-US',
  )
  assert.deepEqual(file.messages, { 保存: 'Save' })
  assert.equal(file.sourceLocale, 'zh-CN')
})

test('normalizes a flat map', () => {
  const file = normalizeCatalogFile({ 保存: 'Save' }, 'en-US')
  assert.deepEqual(file.messages, { 保存: 'Save' })
  assert.equal(file.locale, 'en-US')
})

test('serialisation is sorted, stable and diff friendly', () => {
  const output = stringifyCatalog('en-US', 'zh-CN', { b: 'B', a: 'A' })
  assert.equal(
    output,
    `{\n  "locale": "en-US",\n  "sourceLocale": "zh-CN",\n  "messages": {\n    "a": "A",\n    "b": "B"\n  }\n}\n`,
  )
})

test('rejects garbage', () => {
  assert.throws(() => normalizeCatalogFile('not json'))
  assert.throws(() => normalizeCatalogFile(null))
})

test('drops prototype-polluting keys', () => {
  const file = normalizeCatalogFile(
    JSON.parse('{"__proto__":"polluted","constructor":"polluted","prototype":"polluted","safe":"ok"}'),
    'en-US',
  )
  assert.deepEqual(Object.keys(file.messages), ['safe'])
  assert.equal({}.polluted, undefined)
  assert.equal(Object.getPrototypeOf({}), Object.prototype)
})
