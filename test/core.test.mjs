import test from 'node:test'
import assert from 'node:assert/strict'
import { createI18n } from '../dist/esm/index.js'

const make = () => {
  const i18n = createI18n({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
  i18n.register({
    'en-US': {
      保存项目: 'Save Project',
      '打开@@verb': 'Open',
      '已导出 {count} 个文件': 'Exported {count} files',
    },
  })
  return i18n
}

test('translates and falls back to the source text', () => {
  const i18n = make()
  assert.equal(i18n.t('保存项目'), 'Save Project')
  assert.equal(i18n.t('不存在的文案'), '不存在的文案')
})

test('formats parameters', () => {
  const i18n = make()
  assert.equal(i18n.t('已导出 {count} 个文件', { count: 3 }), 'Exported 3 files')
})

test('context picks a different message', () => {
  const i18n = make()
  assert.equal(i18n.t('打开'), '打开')
  assert.equal(i18n.t('打开', undefined, { context: 'verb' }), 'Open')
})

test('switching locale notifies subscribers', () => {
  const i18n = make()
  let calls = 0
  const unsubscribe = i18n.subscribe(() => {
    calls += 1
  })

  i18n.setLocale('zh-CN')
  assert.equal(i18n.locale, 'zh-CN')
  assert.equal(i18n.t('保存项目'), '保存项目')
  assert.equal(calls, 1)

  i18n.setLocale('en-US')
  assert.equal(i18n.t('保存项目'), 'Save Project')
  assert.equal(calls, 2)

  unsubscribe()
  i18n.setLocale('zh-CN')
  assert.equal(calls, 2)
})

test('applies translations that arrive later', () => {
  const i18n = make()
  let snapshot = i18n.getSnapshot()
  i18n.subscribe(() => {
    snapshot = i18n.getSnapshot()
  })

  i18n.applyTranslation('en-US', '新文案', 'New copy')
  assert.equal(i18n.t('新文案'), 'New copy')
  assert.notEqual(snapshot, '')
})

test('missing handler can resolve a string synchronously', () => {
  const i18n = make()
  const seen = []
  i18n.setMissingHandler((info) => {
    seen.push(info)
    return 'Resolved'
  })

  assert.equal(i18n.t('新文案'), 'Resolved')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].source, '新文案')
  // only reported once
  assert.equal(i18n.t('新文案'), 'Resolved')
  assert.equal(seen.length, 1)
})

test('warnOnMissing logs once per string, even without a missing handler', () => {
  const i18n = createI18n({
    sourceLocale: 'zh-CN',
    locale: 'en-US',
    storage: null,
    warnOnMissing: true,
  })
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))

  try {
    assert.equal(i18n.t('未翻译'), '未翻译')
    assert.equal(i18n.t('未翻译'), '未翻译')
    assert.equal(i18n.t('未翻译', undefined, { context: 'menu' }), '未翻译')
  } finally {
    console.warn = original
  }

  assert.equal(warnings.length, 2, 'one warning per id, context counts separately')
  assert.match(warnings[0], /missing en-US translation for "未翻译"/)
  assert.match(warnings[1], /context: menu/)
})

test('missing handler failures never break rendering', () => {
  const i18n = make()
  i18n.setMissingHandler(() => {
    throw new Error('network down')
  })
  assert.equal(i18n.t('新文案'), '新文案')
})

test('fallback locale is used when the active one lacks a string', () => {
  const i18n = createI18n({
    sourceLocale: 'zh-CN',
    locale: 'ja-JP',
    fallbackLocale: 'en-US',
    storage: null,
    messages: { 'en-US': { 保存: 'Save' } },
  })
  assert.equal(i18n.t('保存'), 'Save')
})

test('regional locales fall back to the base language', () => {
  const i18n = createI18n({ sourceLocale: 'zh-CN', locale: 'en-GB', storage: null })
  i18n.register({ 'en-US': { 保存: 'Save' } })
  i18n.setLocale('en-GB')
  assert.equal(i18n.t('保存'), 'Save')
})

test('getLocales lists the source first', () => {
  const i18n = make()
  assert.deepEqual(i18n.getLocales(), ['zh-CN', 'en-US'])
})

test('a "__proto__" message id cannot pollute prototypes', () => {
  const i18n = createI18n({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
  i18n.register(JSON.parse('{"en-US":{"__proto__":"boom"}}'))

  assert.equal(i18n.t('__proto__'), '__proto__')
  assert.equal({}.boom, undefined)

  i18n.applyTranslation('en-US', '__proto__', 'Safe value')
  assert.equal(i18n.t('__proto__'), 'Safe value')
  assert.equal({}.boom, undefined)
})

test('raw option returns the translation untouched', () => {
  const i18n = make()
  i18n.applyTranslation('en-US', '原始', 'Kept {as-is}')
  assert.equal(i18n.t('原始', undefined, { raw: true }), 'Kept {as-is}')
})
