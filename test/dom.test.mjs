import test from 'node:test'
import assert from 'node:assert/strict'
import { configure } from '../dist/esm/index.js'
import { translateDom } from '../dist/esm/vanilla.js'
import { locale, translator } from '../dist/esm/svelte.js'

function fakeElement(attributes = {}) {
  return {
    textContent: '',
    attributes: { ...attributes },
    getAttribute(name) {
      return this.attributes[name] ?? null
    },
    setAttribute(name, value) {
      this.attributes[name] = value
    },
  }
}

function fakeRoot(elements) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-i18n]')
      return elements
    },
  }
}

function setup() {
  const i18n = configure({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
  i18n.register({ 'en-US': { 保存项目: 'Save Project', 导出: 'Export' } })
  return i18n
}

test('vanilla: translates textContent and follows locale changes', () => {
  const i18n = setup()
  const button = fakeElement({ 'data-i18n': '保存项目' })
  const dispose = translateDom(fakeRoot([button]))

  assert.equal(button.textContent, 'Save Project')

  i18n.setLocale('zh-CN')
  assert.equal(button.textContent, '保存项目')

  i18n.setLocale('en-US')
  assert.equal(button.textContent, 'Save Project')

  dispose()
  i18n.setLocale('zh-CN')
  assert.equal(button.textContent, 'Save Project', 'unsubscribed elements stop updating')
})

test('vanilla: data-i18n-attr writes an attribute instead of the text', () => {
  setup()
  const input = fakeElement({ 'data-i18n': '导出', 'data-i18n-attr': 'placeholder' })
  const dispose = translateDom(fakeRoot([input]))

  assert.equal(input.attributes.placeholder, 'Export')
  assert.equal(input.textContent, '')
  dispose()
})

test('vanilla: does nothing without a document', () => {
  const dispose = translateDom(fakeRoot([]))
  assert.equal(typeof dispose, 'function')
  dispose()
})

test('svelte: the translator store returns a reactive t function', () => {
  const i18n = setup()
  let t
  const unsubscribe = translator(i18n).subscribe((value) => {
    t = value
  })

  assert.equal(t('保存项目'), 'Save Project')
  i18n.setLocale('zh-CN')
  assert.equal(t('保存项目'), '保存项目')
  unsubscribe()
})

test('svelte: the locale store follows the instance', () => {
  const i18n = setup()
  const seen = []
  const unsubscribe = locale(i18n).subscribe((value) => seen.push(value))

  assert.deepEqual(seen, ['en-US'])
  i18n.setLocale('zh-CN')
  assert.deepEqual(seen, ['en-US', 'zh-CN'])
  unsubscribe()
})
