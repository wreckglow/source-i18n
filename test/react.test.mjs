import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { configure } from '../dist/esm/index.js'
import { useT, useLocale } from '../dist/esm/react.js'

function setup() {
  const i18n = configure({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
  i18n.register({ 'en-US': { 你好: 'Hello', 保存项目: 'Save Project' } })
  return i18n
}

test('useT renders translations', () => {
  setup()
  function Hello() {
    const t = useT()
    return createElement('span', null, t('你好'))
  }
  assert.equal(renderToStaticMarkup(createElement(Hello)), '<span>Hello</span>')
})

test('components re-render for the new locale', () => {
  const i18n = setup()
  function Hello() {
    const t = useT()
    return createElement('span', null, t('你好'))
  }

  assert.equal(renderToStaticMarkup(createElement(Hello)), '<span>Hello</span>')
  i18n.setLocale('zh-CN')
  assert.equal(renderToStaticMarkup(createElement(Hello)), '<span>你好</span>')
})

test('useLocale exposes the active locale', () => {
  const i18n = setup()
  function Label() {
    return createElement('i', null, useLocale())
  }
  assert.equal(renderToStaticMarkup(createElement(Label)), '<i>en-US</i>')
  i18n.setLocale('zh-CN')
  assert.equal(renderToStaticMarkup(createElement(Label)), '<i>zh-CN</i>')
})
