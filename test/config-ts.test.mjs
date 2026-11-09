import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '.tmp')
const CLI = path.resolve(HERE, '../dist/esm/cli.js')

const { stripTypeScriptTypes } = await import('node:module')
const canStripeTypes = typeof stripTypeScriptTypes === 'function'

function run(args, cwd) {
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

test(
  'a TypeScript config is staged next to itself, so relative imports resolve',
  { skip: canStripeTypes ? false : 'needs Node 22.13+ for type stripping' },
  async () => {
    const dir = path.join(ROOT, `config-ts-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    // A relative import next to the config: loading the config from a cache
    // directory would fail with ERR_MODULE_NOT_FOUND.
    fs.writeFileSync(path.join(dir, 'options.mjs'), `export const locales = ['en-US']\n`)
    fs.writeFileSync(
      path.join(dir, 'source-i18n.config.ts'),
      [
        `import { locales } from './options.mjs'`,
        `import type { Config } from 'source-i18n'`,
        ``,
        `const config: Config = { source: 'zh-CN', locales, provider: { name: 'manual' } }`,
        `export default config`,
        ``,
      ].join('\n'),
    )
    fs.writeFileSync(
      path.join(dir, 'src/app.ts'),
      `import { t } from 'source-i18n'\nexport const a = t('保存项目')\n`,
    )

    const extract = await run(['extract', '--root', dir], HERE)
    assert.equal(extract.code, 0, extract.stderr)
    assert.match(extract.stdout, /1 string from 1 file/)

    // The staged module must not be left behind.
    const leftovers = fs.readdirSync(dir).filter((name) => name.includes('.source-i18n-'))
    assert.deepEqual(leftovers, [])

    fs.rmSync(dir, { recursive: true, force: true })
  },
)
