import fs from 'node:fs'
import path from 'node:path'
import type { ResolvedConfig } from '../types.js'

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte'])

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.turbo',
  '.cache',
  'vendor',
])

/** Lists source files under the configured include roots. */
export function listSourceFiles(root: string, config: ResolvedConfig): string[] {
  const seen = new Set<string>()
  const files: string[] = []
  const exclude = config.extract.exclude

  /*
   * Exclusions match a path *segment* ("out", "node_modules") unless the
   * pattern contains a slash or a wildcard. Matching the whole path string
   * would silently skip projects whose name merely contains "out", "dist" or
   * "build" — e.g. "checkout-service" or a folder called "layout-builder".
   */
  const isExcluded = (full: string, name: string): boolean => {
    const relative = path.relative(root, full).split(path.sep).join('/')
    return exclude.some((pattern) => {
      if (!pattern) return false
      if (pattern.includes('*') || pattern.includes('/') || pattern.includes('\\')) {
        return relative.includes(pattern.replace(/\*/g, ''))
      }
      return name === pattern
    })
  }

  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (isExcluded(full, entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!EXTENSIONS.has(path.extname(entry.name))) continue
      if (entry.name.endsWith('.d.ts')) continue
      if (isExcluded(full, entry.name)) continue
      if (seen.has(full)) continue
      seen.add(full)
      files.push(full)
    }
  }

  for (const dir of config.extract.include) {
    const abs = path.resolve(root, dir)
    if (!fs.existsSync(abs)) continue
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) walk(abs)
    else if (EXTENSIONS.has(path.extname(abs)) && !seen.has(abs)) {
      seen.add(abs)
      files.push(abs)
    }
  }

  return files
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Cross-process mutex built on `mkdir` (atomic on every OS we care about).
 * Read-modify-write of a catalog is not atomic across processes; without this,
 * two dev servers on the same project silently drop each other's translations.
 */
export function withFileLock<T>(
  file: string,
  run: () => T,
  options: { timeoutMs?: number; staleMs?: number } = {},
): T {
  const lockPath = `${file}.lock`
  // A live writer holds the lock for a millisecond, so a 2s-old lock is dead.
  // The timeout must be longer than the stale window, otherwise a crashed
  // process would make every later write fail before the lock can be cleared.
  const timeoutMs = options.timeoutMs ?? 6000
  const staleMs = options.staleMs ?? 2000
  const started = Date.now()

  // The catalog directory may not exist yet on the very first translation.
  fs.mkdirSync(path.dirname(file), { recursive: true })

  for (;;) {
    try {
      fs.mkdirSync(lockPath)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new Error(`source-i18n: could not lock ${file}: ${(error as Error).message}`)
      }

      try {
        const stat = fs.statSync(lockPath)
        if (Date.now() - stat.mtimeMs > staleMs) {
          fs.rmSync(lockPath, { recursive: true, force: true })
          continue
        }
      } catch {
        /* the lock disappeared between stat and rm */
      }

      if (Date.now() - started > timeoutMs) {
        throw new Error(`source-i18n: timed out waiting for the file lock on ${file}`)
      }
      sleepSync(5 + Math.floor(Math.random() * 10))
    }
  }

  try {
    return run()
  } finally {
    try {
      fs.rmSync(lockPath, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
}

export function readTextFile(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/** Writes a file atomically so watchers never observe a partial write. */
export function writeFileAtomic(file: string, contents: string): void {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`)

  try {
    fs.writeFileSync(tmp, contents, 'utf8')
    fs.renameSync(tmp, file)
  } catch (error) {
    // Never leave a ".en-US.json.1234.tmp" behind when the target is read-only.
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* best effort */
    }
    throw new Error(`source-i18n: could not write ${file}: ${(error as Error).message}`)
  }
}
