import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, '..', 'dist', 'esm', 'cli.js')
const root = path.join(here, '.tmp', 'skill-cli')

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
}

test('skill command installs the portable skill and refuses to overwrite by default', () => {
  fs.rmSync(root, { recursive: true, force: true })

  const first = run(['skill', '--dir', root])
  assert.equal(first.status, 0, first.stderr)
  assert.ok(fs.existsSync(path.join(root, 'source-i18n', 'SKILL.md')))

  const second = run(['skill', '--dir', root])
  assert.equal(second.status, 1)
  assert.match(second.stderr, /already exists/)

  const forced = run(['skill', '--dir', root, '--force'])
  assert.equal(forced.status, 0, forced.stderr)

  fs.rmSync(root, { recursive: true, force: true })
})

test('skill command requires --dir', () => {
  const result = run(['skill'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /needs --dir/)
})
