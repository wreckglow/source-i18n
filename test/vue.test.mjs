import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { configure } from '../dist/esm/index.js'
import { createI18nPlugin, useLocale, useSetLocale, useT } from '../dist/esm/vue.js'

function setup() {
  const i18n = configure({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
  i18n.register({
    'en-US': { 保存项目: 'Save Project', '你好 {name}': 'Hello {name}' },
    'ja-JP': { 保存项目: 'プロジェクトを保存' },
  })
  return i18n
}

async function render(component, i18n) {
  const app = createSSRApp(component)
  app.use(createI18nPlugin(i18n))
  return renderToString(app)
}

test('vue: useT renders translations through inject', async () => {
  const i18n = setup()
  const App = defineComponent({
    setup() {
      const t = useT()
      return () => h('span', t('保存项目'))
    },
  })

  assert.equal(await render(App, i18n), '<span>Save Project</span>')
})

test('vue: useLocale is reactive and setLocale switches language', async () => {
  const i18n = setup()
  const App = defineComponent({
    setup() {
      const t = useT()
      const locale = useLocale()
      return () => h('div', { 'data-locale': locale.value }, t('保存项目'))
    },
  })

  assert.match(await render(App, i18n), /Save Project/)
  assert.match(await render(App, i18n), /data-locale="en-US"/)

  i18n.setLocale('ja-JP')
  assert.match(await render(App, i18n), /プロジェクトを保存/)
  assert.match(await render(App, i18n), /data-locale="ja-JP"/)
})

test('vue: useSetLocale switches the instance', async () => {
  const i18n = setup()
  const App = defineComponent({
    setup() {
      const setLocale = useSetLocale()
      const t = useT()
      return () => h('button', { onClick: () => setLocale('ja-JP') }, t('保存项目'))
    },
  })

  await render(App, i18n)
  // invoke the same setter the component would call
  useSetLocale(i18n)('ja-JP')
  assert.equal(i18n.locale, 'ja-JP')
  assert.match(await render(App, i18n), /プロジェクトを保存/)
})

test('vue: $t and $i18n are exposed on the app', async () => {
  const i18n = setup()
  const App = defineComponent({
    render() {
      return h('span', this.$t('保存项目'))
    },
  })

  assert.equal(await render(App, i18n), '<span>Save Project</span>')
})

test('vue: interpolation works in templates', async () => {
  const i18n = setup()
  const App = defineComponent({
    setup() {
      const t = useT()
      return () => h('p', t('你好 {name}', { name: 'Ada' }))
    },
  })

  assert.equal(await render(App, i18n), '<p>Hello Ada</p>')
})
