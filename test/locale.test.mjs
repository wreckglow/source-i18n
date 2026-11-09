import test from 'node:test'
import assert from 'node:assert/strict'
import { createI18n, matchLocale, normalizeLocale } from '../dist/esm/index.js'

const STORAGE_KEY = 'source-i18n:locale'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
  }
}

/** Overrides globalThis.navigator for the duration of a synchronous callback. */
function withBrowserLanguages(languages, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: { languages, language: languages[0] },
    configurable: true,
  })
  try {
    return run()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
  }
}

const catalogs = {
  'en-US': { 保存: 'Save', 打开: 'Open', '已导出 {count} 个文件': 'Exported {count} files' },
  'ja-JP': { 保存: '保存する', '已导出 {count} 个文件': '{count} 件をエクスポートしました' },
}

test('detects the browser language when nothing is stored', () => {
  withBrowserLanguages(['ja-JP', 'en-US'], () => {
    const i18n = createI18n({ sourceLocale: 'zh-CN', storage: memoryStorage(), messages: catalogs })
    assert.equal(i18n.locale, 'ja-JP')
  })
})

test('a chinese browser stays on the source language', () => {
  withBrowserLanguages(['zh-CN', 'zh'], () => {
    const i18n = createI18n({ sourceLocale: 'zh-CN', storage: memoryStorage(), messages: catalogs })
    assert.equal(i18n.locale, 'zh-CN')
    assert.equal(i18n.t('保存'), '保存')
  })
})

test('an unsupported browser language falls back to the fallback locale', () => {
  withBrowserLanguages(['fr-FR'], () => {
    const i18n = createI18n({
      sourceLocale: 'zh-CN',
      fallbackLocale: 'en-US',
      storage: memoryStorage(),
      messages: catalogs,
    })
    assert.equal(i18n.locale, 'en-US')
  })
})

test('a stored choice wins over the browser language', () => {
  withBrowserLanguages(['ja-JP'], () => {
    const i18n = createI18n({
      sourceLocale: 'zh-CN',
      storage: memoryStorage({ [STORAGE_KEY]: 'en-US' }),
      messages: catalogs,
    })
    assert.equal(i18n.locale, 'en-US')
  })
})

test('switching persists and survives a reload', () => {
  withBrowserLanguages(['en-US'], () => {
    const storage = memoryStorage()
    const i18n = createI18n({ sourceLocale: 'zh-CN', storage, messages: catalogs })
    assert.equal(i18n.locale, 'en-US')

    i18n.setLocale('ja-JP')
    assert.equal(storage.getItem(STORAGE_KEY), 'ja-JP')

    const reloaded = createI18n({ sourceLocale: 'zh-CN', storage, messages: catalogs })
    assert.equal(reloaded.locale, 'ja-JP')
    assert.equal(reloaded.t('保存'), '保存する')
  })
})

test('switching updates every string, including formatted ones', () => {
  const i18n = createI18n({
    sourceLocale: 'zh-CN',
    locale: 'en-US',
    storage: null,
    messages: catalogs,
  })

  assert.equal(i18n.t('已导出 {count} 个文件', { count: 3 }), 'Exported 3 files')

  i18n.setLocale('ja-JP')
  assert.equal(i18n.t('已导出 {count} 个文件', { count: 3 }), '3 件をエクスポートしました')

  i18n.setLocale('zh-CN')
  assert.equal(i18n.t('已导出 {count} 个文件', { count: 3 }), '已导出 3 个文件')
})

test('a regional tag maps to the closest catalog', () => {
  const i18n = createI18n({ sourceLocale: 'zh-CN', locale: 'en-GB', storage: null, messages: catalogs })
  assert.equal(i18n.locale, 'en-US')
  assert.equal(i18n.t('打开'), 'Open')

  i18n.setLocale('ja-JP')
  assert.equal(i18n.locale, 'ja-JP')
})

test('a missing string falls back to the fallback locale', () => {
  const i18n = createI18n({
    sourceLocale: 'zh-CN',
    locale: 'ja-JP',
    fallbackLocale: 'en-US',
    storage: null,
    messages: catalogs,
  })
  assert.equal(i18n.t('打开'), 'Open')
})

test('the source text wins when nothing matches at all', () => {
  const i18n = createI18n({ sourceLocale: 'zh-CN', locale: 'ja-JP', storage: null, messages: catalogs })
  assert.equal(i18n.t('打开'), '打开')
})

test('locale helpers normalise tags', () => {
  assert.equal(normalizeLocale('zh_cn'), 'zh-CN')
  assert.equal(normalizeLocale(' en_US '), 'en-US')
  assert.equal(matchLocale('en-GB', ['en-US']), 'en-US')
  assert.equal(matchLocale('fr-FR', ['en-US', 'ja-JP']), undefined)
})
