import fs from 'node:fs'
import path from 'node:path'
import { normalizeCatalogFile, stringifyCatalog } from '../catalog.js'
import type { Catalog, ResolvedConfig } from '../types.js'
import { writeFileAtomic } from './files.js'

export function catalogPath(root: string, config: ResolvedConfig, locale: string): string {
  return path.join(root, config.catalogs, `${locale}.json`)
}

export function metaPath(root: string, config: ResolvedConfig, locale: string): string {
  return path.join(root, config.catalogs, `${locale}.meta.json`)
}

export function readCatalog(file: string, locale: string): Catalog {
  if (!fs.existsSync(file)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown
    return normalizeCatalogFile(parsed, locale).messages
  } catch (error) {
    throw new Error(`source-i18n: could not read ${file}: ${(error as Error).message}`)
  }
}

export function writeCatalog(
  file: string,
  locale: string,
  sourceLocale: string,
  messages: Catalog,
): void {
  writeFileAtomic(file, stringifyCatalog(locale, sourceLocale, messages))
}

/** Reads every locale catalog in the configured directory. */
export function readAllCatalogs(config: ResolvedConfig): Record<string, Catalog> {
  const dir = path.join(config.root, config.catalogs)
  const catalogs: Record<string, Catalog> = {}
  if (!fs.existsSync(dir)) return catalogs

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue
    if (entry.endsWith('.meta.json') || entry.endsWith('.cache.json')) continue
    const locale = entry.slice(0, -'.json'.length)
    try {
      catalogs[locale] = readCatalog(path.join(dir, entry), locale)
    } catch {
      /* a broken catalog should not take the dev server down */
    }
  }
  return catalogs
}
