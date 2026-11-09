import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const tsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')

const run = (args) => {
  // stdio: 'inherit' matters: piped child output is blocked in restricted sandboxes.
  const r = spawnSync(process.execPath, [tsc, ...args], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

rmSync(path.join(root, 'dist'), { recursive: true, force: true })

console.log('• esm + types')
run(['-p', 'tsconfig.build.json'])

console.log('• cjs')
run(['-p', 'tsconfig.cjs.json'])

const cjsDir = path.join(root, 'dist', 'cjs')
mkdirSync(cjsDir, { recursive: true })
writeFileSync(path.join(cjsDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')

/*
 * TypeScript decides whether a .d.ts file describes an ES module or a CommonJS
 * module from the nearest package.json `type`. dist/cjs is "commonjs", so the
 * declarations copied there are CJS-scoped and a `require()`-style consumer
 * gets the matching typings instead of TS1479 ("cannot import an ES module").
 */
const typesDir = path.join(root, 'dist', 'types')
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })

let copied = 0
for (const file of walk(typesDir)) {
  if (!file.endsWith('.d.ts')) continue
  const js = path.relative(typesDir, file).replace(/\.d\.ts$/, '.js')
  // cli, mcp and the unplugin adapters are ESM-only: no CJS build, no CJS types.
  if (!existsSync(path.join(cjsDir, js))) continue
  const dest = path.join(cjsDir, js.replace(/\.js$/, '.d.ts'))
  mkdirSync(path.dirname(dest), { recursive: true })
  copyFileSync(file, dest)
  copied += 1
}

console.log(`• cjs types (${copied} files)`)
console.log('✓ build complete')
