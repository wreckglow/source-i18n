import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatProject } from '../dist/esm/node/normalize.js'
import { resolveConfig } from '../dist/esm/config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')
const CLI = path.resolve(HERE, '../dist/esm/cli.js')

function run(args, cwd = HERE) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

function project(name, { withCatalog = false } = {}) {
  const dir = path.join(ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'source-i18n.config.mjs'),
    `export default { source: 'zh-CN', locales: ['en-US'], provider: 'manual' }\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'src/app.ts'),
    `import { t } from 'source-i18n'\nexport const a = t('保存项目')\nexport const b = t('导出')\n`,
  )
  if (withCatalog) {
    const config = resolveConfig({ source: 'zh-CN', locales: ['en-US'], provider: 'manual' }, dir)
    fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'i18n/locales/en-US.json'),
      JSON.stringify({ locale: 'en-US', sourceLocale: 'zh-CN', messages: { 保存项目: 'Save', 导出: 'Export' } }),
    )
    formatProject({ root: dir, config })
  }
  return dir
}

test('--version prints the package version', async () => {
  const result = await run(['--version'])
  assert.equal(result.code, 0)
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/)
})

test('extract reports the strings it found', async () => {
  const dir = project('cli-extract')
  const result = await run(['extract', '--root', dir])
  assert.equal(result.code, 0)
  assert.match(result.stdout, /2 strings from 1 file/)
})

test('check fails when translations are missing', async () => {
  const dir = project('cli-check-missing')
  const result = await run(['check', '--root', dir])
  assert.equal(result.code, 1)
  assert.match(result.stdout, /missing/)
  assert.match(result.stdout, /failed/)
})

test('check passes on a complete catalog', async () => {
  const dir = project('cli-check-ok', { withCatalog: true })
  const result = await run(['check', '--root', dir])
  assert.equal(result.code, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /all good/)
})

test('check --json is machine readable', async () => {
  const dir = project('cli-check-json', { withCatalog: true })
  const result = await run(['check', '--json', '--root', dir])
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.locales[0].missing.length, 0)
})

test('sync with the manual provider reports missing strings and writes nothing', async () => {
  const dir = project('cli-sync-manual')
  const result = await run(['sync', '--root', dir])
  assert.equal(result.code, 1)
  assert.match(result.stdout, /2 missing/)
  assert.equal(fs.existsSync(path.join(dir, 'i18n/locales/en-US.json')), false)
})

test('dry run does not touch the network or the disk', async () => {
  const dir = project('cli-dry')
  const result = await run(['sync', '--dry-run', '--root', dir])
  assert.equal(result.code, 0)
  assert.match(result.stdout, /dry run/)
  assert.equal(fs.existsSync(path.join(dir, 'i18n')), false)
})

test('format --check fails on a non-normalised catalog', async () => {
  const dir = project('cli-format-dirty')
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'i18n/locales/en-US.json'), '{"messages":{"b":"B","a":"A"}}')

  const result = await run(['format', '--check', '--root', dir])
  assert.equal(result.code, 1)
  assert.match(result.stdout, /need normalising/)
})

test('format normalises and is idempotent', async () => {
  const dir = project('cli-format-fix')
  fs.mkdirSync(path.join(dir, 'i18n/locales'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'i18n/locales/en-US.json'), '{"messages":{"b":"B","a":"A"}}')

  assert.equal((await run(['format', '--root', dir])).code, 0)
  const first = fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8')
  assert.equal((await run(['format', '--root', dir])).code, 0)
  assert.equal(fs.readFileSync(path.join(dir, 'i18n/locales/en-US.json'), 'utf8'), first)
})

test('--ascii escapes Chinese source strings in output', async () => {
  const dir = project('cli-ascii')
  const result = await run(['check', '--ascii', '--root', dir])
  assert.equal(result.code, 1)
  assert.ok(result.stdout.includes('\\u4fdd'), result.stdout)
  assert.equal(result.stdout.includes('保存项目'), false)
})

test('a missing config gives a helpful error', async () => {
  const dir = path.join(ROOT, `cli-noconfig-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  const result = await run(['sync', '--root', dir])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /no config file found/)
})

test('--help after a command prints usage instead of running the command', async () => {
  const dir = project('cli-help')
  const result = await run(['extract', '--help', '--root', dir])
  assert.equal(result.code, 0)
  assert.match(result.stdout, /Usage/)
  assert.equal(result.stdout.includes('strings from'), false)
})

test('an unknown option fails instead of being silently ignored', async () => {
  const dir = project('cli-typo')
  const result = await run(['sync', '--dryrun', '--root', dir])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /dryrun/)
  assert.equal(fs.existsSync(path.join(dir, 'i18n')), false)
})

test('sync accepts --no-tm', async () => {
  const dir = project('cli-no-tm')
  const result = await run(['sync', '--dry-run', '--no-tm', '--root', dir])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /dry run/)
})
