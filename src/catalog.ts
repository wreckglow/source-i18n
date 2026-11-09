import type { Catalog, LocaleCatalogFile } from './types.js'

/** Separates a source string from its disambiguating context. */
const SEP = '@@'

/**
 * Message ids are the source text itself, optionally suffixed with a context:
 *
 *   t('Open')                 -> "Open"
 *   t('Open', { context: 'verb' }) -> "Open@@verb"
 *
 * Literal "@@" inside a source string is escaped as "@@@@".
 */
export function messageKey(source: string, context?: string): string {
  const escaped = source.replace(/@@/g, '@@@@')
  return context ? `${escaped}${SEP}${context}` : escaped
}

export function splitKey(key: string): { source: string; context?: string } {
  let i = 0
  while (i < key.length - 1) {
    if (key[i] === '@' && key[i + 1] === '@') {
      if (key[i + 2] === '@' && key[i + 3] === '@') {
        i += 4
        continue
      }
      return { source: unescapeSource(key.slice(0, i)), context: key.slice(i + 2) }
    }
    i += 1
  }
  return { source: unescapeSource(key) }
}

function unescapeSource(source: string): string {
  return source.replace(/@@@@/g, '@@')
}

/** Accepts our own format, a raw flat map, or `{ messages: ... }`. */
export function normalizeCatalogFile(input: unknown, locale = ''): LocaleCatalogFile {
  // Editors on Windows love to add a BOM; JSON.parse chokes on it.
  if (typeof input === 'string') return normalizeCatalogFile(JSON.parse(input.replace(/^\uFEFF/, '')), locale)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid catalog: expected an object')
  }
  const obj = input as Record<string, unknown>
  const messages: Catalog = {}

  const pick = (source: unknown) => {
    if (!source || typeof source !== 'object') return
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      // Never let a catalog key reach the prototype chain.
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      if (typeof value === 'string') messages[key] = value
    }
  }

  if (obj.messages && typeof obj.messages === 'object') pick(obj.messages)
  else pick(obj)

  return {
    locale: typeof obj.locale === 'string' ? obj.locale : locale,
    sourceLocale: typeof obj.sourceLocale === 'string' ? obj.sourceLocale : undefined,
    messages,
  }
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Deterministic, diff-friendly catalog serialisation. */
export function stringifyCatalog(
  locale: string,
  sourceLocale: string | undefined,
  messages: Catalog,
): string {
  const sorted: Catalog = {}
  for (const key of Object.keys(messages).sort(compareKeys)) sorted[key] = messages[key]!

  const body: LocaleCatalogFile = { locale, ...(sourceLocale ? { sourceLocale } : {}), messages: sorted }
  return JSON.stringify(body, null, 2) + '\n'
}

export function mergeCatalogs(target: Catalog, source: Catalog): Catalog {
  return Object.assign(target, source)
}
