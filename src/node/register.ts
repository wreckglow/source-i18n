import path from 'node:path'
import { registerCatalogs } from '../index.js'
import type { Catalog, ResolvedConfig } from '../types.js'
import { readAllCatalogs } from './catalog-io.js'

/**
 * Loads catalogs from a directory in Node (Electron main process, SSR,
 * scripts). Synchronous on purpose: no flash of untranslated content.
 */
export function registerFromDisk(
  directory: string,
  options: { sourceLocale?: string; fallbackLocale?: string } = {},
): Record<string, Catalog> {
  const absolute = path.resolve(directory)
  const pseudoConfig = {
    root: path.dirname(absolute),
    catalogs: path.basename(absolute),
  } as unknown as ResolvedConfig

  const catalogs = readAllCatalogs(pseudoConfig)
  registerCatalogs(catalogs, options)
  return catalogs
}

/** Best-effort OS locale, useful for Electron's main process. */
export function systemLocale(): string {
  const env = process.env
  return (
    env.SOURCE_I18N_LOCALE ||
    env.LC_ALL ||
    env.LC_MESSAGES ||
    env.LANG ||
    (env.LANGUAGE ? env.LANGUAGE.split(':')[0]! : '') ||
    'en'
  )
}
