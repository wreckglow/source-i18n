import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'

/*
 * Windows shells do not expand globs, and Node 20's test runner does not either
 * (Node 22+ does). Listing the files here keeps `npm test` working on every
 * supported Node version and on every platform. `stdio: 'inherit'` matters:
 * piped child output is blocked in restricted sandboxes.
 */
const files = readdirSync('test')
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join('test', name))

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
