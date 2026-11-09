import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configure, t } from '../dist/esm/index.js'
import { registerFromDisk, systemLocale } from '../dist/esm/node/register.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

test('registerFromDisk loads catalogs synchronously', () => {
  const dir = path.join(ROOT, `disk-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'en-US.json'),
    JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: 'Save Project' } }),
  )

  configure({ sourceLocale: 'zh-CN', locale: 'en-US', storage: null })
  const catalogs = registerFromDisk(dir, { sourceLocale: 'zh-CN' })

  assert.deepEqual(Object.keys(catalogs), ['en-US'])
  assert.equal(t('保存项目'), 'Save Project')
})

test('systemLocale always returns something', () => {
  assert.equal(typeof systemLocale(), 'string')
  assert.ok(systemLocale().length > 0)
})
