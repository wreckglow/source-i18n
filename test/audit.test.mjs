import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../dist/esm/config.js'
import { writeCatalog } from '../dist/esm/node/catalog-io.js'
import { withFileLock } from '../dist/esm/node/files.js'
import { readMeta } from '../dist/esm/node/meta.js'
import { formatProject } from '../dist/esm/node/normalize.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function workspace(name) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  return dir
}

test('a lock left by a crashed process is recovered, not fatal', () => {
  const dir = workspace('stale-lock')
  const file = path.join(dir, 'i18n/locales/en-US.json')
  fs.writeFileSync(file, '{"locale":"en-US","messages":{}}')

  const lock = `${file}.lock`
  fs.mkdirSync(lock)
  const threeSecondsAgo = new Date(Date.now() - 3000)
  fs.utimesSync(lock, threeSecondsAgo, threeSecondsAgo)

  const started = Date.now()
  writeCatalogIfLocked(file)
  const elapsed = Date.now() - started

  assert.ok(elapsed < 2000, `recovery took ${elapsed}ms`)
  assert.equal(fs.existsSync(lock), false, 'the stale lock is removed')
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).messages, { a: 'A' })
})

function writeCatalogIfLocked(file) {
  withFileLock(file, () => writeCatalog(file, 'en-US', 'zh-CN', { a: 'A' }))
}

test('two files that normalise to the same locale are rejected instead of merged', () => {
  const dir = workspace('collision')
  const locales = path.join(dir, 'i18n/locales')
  fs.writeFileSync(path.join(locales, 'zh-CN.json'), JSON.stringify({ locale: 'zh-CN', messages: { keep: 'KEEP' } }))
  fs.writeFileSync(path.join(locales, 'zh_cn.json'), JSON.stringify({ locale: 'zh-cn', messages: { other: 'OTHER' } }))

  const config = resolveConfig({ source: 'fr-FR', locales: ['zh-CN'] }, dir)
  assert.throws(() => formatProject({ root: dir, config }), /merge them manually/)

  // Nothing is written or deleted.
  assert.deepEqual(fs.readdirSync(locales).sort(), ['zh-CN.json', 'zh_cn.json'])
  assert.match(fs.readFileSync(path.join(locales, 'zh-CN.json'), 'utf8'), /KEEP/)
})

test('a meta file with a BOM is still read', () => {
  const dir = workspace('meta-bom')
  const file = path.join(dir, 'en-US.meta.json')
  fs.writeFileSync(file, '\uFEFF{"version":1,"messages":{"a":{"by":"mt","h":"x"}}}')

  assert.deepEqual(readMeta(file).messages, { a: { by: 'mt', h: 'x' } })
})
