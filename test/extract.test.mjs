import test from 'node:test'
import assert from 'node:assert/strict'
import { extractMessages, importsKeyless } from '../dist/esm/node/extract.js'

const HEADER = `import { t } from 'source-i18n'\n`

const scan = (body, options = {}) => extractMessages(HEADER + body, { file: 'app.tsx', ...options })

test('detects the keyless import', () => {
  assert.equal(importsKeyless(`import { t } from 'source-i18n'`), true)
  assert.equal(importsKeyless(`const x = require("source-i18n")`), true)
  assert.equal(importsKeyless(`import { useT } from 'source-i18n/react'`), true)
  assert.equal(importsKeyless(`import { t } from 'other-package'`), false)
})

test('files without the import are ignored', () => {
  const result = extractMessages(`const a = t('保存项目')`, { file: 'a.ts' })
  assert.equal(result.messages.length, 0)
})

test('finds basic calls', () => {
  const result = scan(`const a = t('保存项目')\nconst b = t("导出")\n`)
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['保存项目', '导出'],
  )
})

test('records context and message id', () => {
  const result = scan(`t('打开', { context: 'verb' })`)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].source, '打开')
  assert.equal(result.messages[0].context, 'verb')
  assert.equal(result.messages[0].id, '打开@@verb')
})

test('ignores comments and strings', () => {
  const result = scan(`
    // t('注释')
    /* t('块注释') */
    const s = "t('字符串里的')"
    const r = /t\\('正则里的'\\)/
    t('真的')
  `)
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['真的'],
  )
})

test('supports template literals without interpolation', () => {
  const result = scan('t(`你好`)')
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['你好'],
  )
})

test('finds calls inside template interpolations', () => {
  const result = scan('const html = `<b>${t(\'保存\')}</b>`\nconst other = t(\'导出\')\n')
  assert.deepEqual(
    result.messages.map((message) => message.source),
    ['保存', '导出'],
  )
  assert.equal(result.dynamic.length, 0)
})

test('keeps line numbers for calls inside multiline templates', () => {
  const result = scan('const html = `\n<span>${t(\'保存\')}</span>\n`\n')
  assert.equal(result.messages[0].line, 3)
})

test('extracts both branches of a conditional', () => {
  const result = scan(`const n = 1\nconst a = t(n === 1 ? '个音色' : '个音色们')\n`)
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['个音色', '个音色们'],
  )
  assert.equal(result.dynamic.length, 0)
})

test('extracts literals from nullish and logical fallbacks', () => {
  const result = scan(`const a = t(name ?? '未命名')\nconst b = t(label || '默认')\n`)
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['未命名', '默认'],
  )
  assert.equal(result.dynamic.length, 0)
})

test('folds fully literal concatenation but keeps mixed ones dynamic', () => {
  const folded = scan(`const a = t('保存' + '项目')\n`)
  assert.deepEqual(
    folded.messages.map((m) => m.source),
    ['保存项目'],
  )

  const mixed = scan(`const name = 'x'\nconst b = t('保存' + name)\n`)
  assert.equal(mixed.messages.length, 0)
  assert.equal(mixed.dynamic.length, 1)
})

test('reports dynamic calls instead of guessing', () => {
  const result = scan(`const key = 'x'\nt(key)\nt(\`a\${key}\`)`)
  assert.equal(result.messages.length, 0)
  assert.equal(result.dynamic.length, 2)
})

test('skips nested calls inside arguments', () => {
  const result = scan(`t('外层', { value: fn(1, '内层') })`)
  assert.deepEqual(
    result.messages.map((m) => m.source),
    ['外层'],
  )
})

test('handles escapes', () => {
  const result = scan(`t('say "hi" and \\'bye\\'')`)
  assert.equal(result.messages[0].source, `say "hi" and 'bye'`)
})

test('finds calls across multiple lines', () => {
  const result = scan(`t(\n  '保存',\n  { context: 'menu' }\n)`)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].context, 'menu')
})

test('reports 1-based line numbers', () => {
  const result = scan(`\n\nt('第三行')`)
  assert.equal(result.messages[0].line, 4) // header + 2 blank lines + 1
})

test('supports custom function names', () => {
  const code = `${HEADER}const a = $t('导出')`
  const result = extractMessages(code, { file: 'a.ts', functions: ['$t'] })
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].source, '导出')
})

test('force scans files without the import', () => {
  const result = extractMessages(`const a = t('独立')`, { file: 'a.ts', force: true })
  assert.equal(result.messages.length, 1)
})
