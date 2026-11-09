import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveConfig } from '../config.js'
import type { Config, ResolvedConfig } from '../types.js'

const CONFIG_FILES = [
  'source-i18n.config.ts',
  'source-i18n.config.mts',
  'source-i18n.config.mjs',
  'source-i18n.config.js',
  'source-i18n.config.cjs',
  'source-i18n.config.json',
  'i18n.config.ts',
  'i18n.config.mts',
  'i18n.config.mjs',
  'i18n.config.json',
]

export function findConfigFile(root: string): string | undefined {
  for (const name of CONFIG_FILES) {
    const file = path.join(root, name)
    if (fs.existsSync(file)) return file
  }
  return undefined
}

export async function loadConfig(root: string, explicit?: string): Promise<ResolvedConfig> {
  const file = explicit ? path.resolve(root, explicit) : findConfigFile(root)
  if (!file) {
    throw new Error(
      'source-i18n: no config file found. Run "npx source-i18n init" or create source-i18n.config.mjs with { source, locales }.',
    )
  }
  if (!fs.existsSync(file)) {
    throw new Error(`source-i18n: config file not found: ${file}`)
  }

  const config = await readConfigModule(file, path.dirname(file))
  return resolveConfig(config, path.dirname(file))
}

async function readConfigModule(file: string, root: string): Promise<Config> {
  const ext = path.extname(file)

  if (ext === '.json') {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Config
  }

  if (ext === '.cjs') {
    const { createRequire } = await import('node:module')
    const require = createRequire(file)
    const mod = require(file) as { default?: Config } | Config
    return (mod as { default?: Config }).default ?? (mod as Config)
  }

  if (ext === '.ts' || ext === '.mts') {
    return readTypeScriptConfig(file, root)
  }

  const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as { default?: Config }
  return mod.default ?? (mod as unknown as Config)
}

/**
 * Node's built-in type stripping lets TypeScript configs load without depending
 * on esbuild. The stripped module is staged next to the config file so that
 * relative imports (`import { locales } from './options.mjs'`) and bare package
 * imports resolve exactly as they do for the original file.
 */
async function readTypeScriptConfig(file: string, root: string): Promise<Config> {
  const nodeModule = (await import('node:module')) as unknown as {
    stripTypeScriptTypes?: (source: string, options?: { mode?: 'strip' | 'transform' }) => string
  }

  if (typeof nodeModule.stripTypeScriptTypes !== 'function') {
    throw new Error(
      `source-i18n: ${path.basename(file)} needs Node 22.13+ to load (running ${process.version}). ` +
        'Use source-i18n.config.mjs instead, or upgrade Node.',
    )
  }

  const source = fs.readFileSync(file, 'utf8')
  const code = nodeModule.stripTypeScriptTypes(source, { mode: 'transform' })

  const name = `.${path.basename(file)}.source-i18n-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`
  // Preferred: same directory as the config. Fallback: the cache directory, for
  // read-only checkouts (relative imports may not resolve from there).
  const candidates = [
    path.join(path.dirname(file), name),
    path.join(root, 'node_modules', '.cache', 'source-i18n', name),
  ]

  let staged: string | undefined
  let lastError: Error | undefined
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true })
      fs.writeFileSync(candidate, code, 'utf8')
      staged = candidate
      break
    } catch (error) {
      lastError = error as Error
    }
  }
  if (!staged) {
    throw new Error(
      `source-i18n: could not stage ${path.basename(file)} for loading: ${lastError?.message ?? 'unknown error'}`,
    )
  }

  try {
    const mod = (await import(pathToFileURL(staged).href)) as { default?: Config }
    return mod.default ?? (mod as unknown as Config)
  } finally {
    fs.rmSync(staged, { force: true })
  }
}
