import { messageKey } from './catalog.js'
import { formatMessage, matchLocale, normalizeLocale } from './format.js'
import type { Catalog } from './types.js'

export type {
  Catalog,
  LocaleCatalogFile,
  Provider,
  ProviderConfig,
  TranslateItem,
  TranslateRequest,
  TranslateResult,
  Config,
  ResolvedConfig,
} from './types.js'
export { defineConfig, resolveConfig, DEFAULT_CATALOGS } from './config.js'
export { formatMessage, normalizeLocale, matchLocale, MessageSyntaxError } from './format.js'
export { messageKey, splitKey } from './catalog.js'

export interface MissingInfo {
  source: string
  context?: string
  locale: string
}

export type MissingHandler = (info: MissingInfo) => void | string | Promise<string | void>

export interface TranslateOptions {
  /** Disambiguates the same source text used in different roles. */
  context?: string
  /** Return the translation as-is, without formatting. */
  raw?: boolean
  /** Translate for a specific locale instead of the active one. */
  locale?: string
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface I18nOptions {
  sourceLocale?: string
  locale?: string
  fallbackLocale?: string
  messages?: Record<string, Catalog>
  missing?: MissingHandler
  /** Log a console warning the first time a string has no translation. */
  warnOnMissing?: boolean
  /** Defaults to localStorage when available, otherwise null. */
  storage?: StorageLike | null
  storageKey?: string
}

const DEFAULT_STORAGE_KEY = 'source-i18n:locale'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function emptyCatalog(): Catalog {
  return Object.create(null) as Catalog
}

function assignCatalog(target: Catalog, source: Catalog): Catalog {
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) continue
    target[key] = source[key]!
  }
  return target
}

function detectStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    /* access can throw in sandboxed iframes */
  }
  return null
}

/**
 * The runtime. Create one per app (or use the default singleton), register
 * catalogs, then call `t()`.
 */
export class I18n {
  private catalogs = new Map<string, Catalog>()
  private localeValue: string
  private source: string
  private fallbackValue?: string
  private listeners = new Set<() => void>()
  private version = 0
  private missingHandler?: MissingHandler
  private warnOnMissing: boolean
  private reported = new Set<string>()
  private storage: StorageLike | null
  private storageKey: string
  private explicitLocale: boolean

  constructor(options: I18nOptions = {}) {
    this.source = normalizeLocale(options.sourceLocale ?? 'en')
    this.fallbackValue = options.fallbackLocale ? normalizeLocale(options.fallbackLocale) : undefined
    this.storage = options.storage === undefined ? detectStorage() : options.storage
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
    this.explicitLocale = Boolean(options.locale)
    this.localeValue = this.source
    this.missingHandler = options.missing
    this.warnOnMissing = options.warnOnMissing ?? false

    if (options.messages) {
      for (const [locale, messages] of Object.entries(options.messages)) {
        this.catalogs.set(normalizeLocale(locale), assignCatalog(emptyCatalog(), messages))
      }
    }

    // Resolve after the catalogs exist: "en-GB" becomes "en-US" when only
    // en-US is available, instead of silently falling back to the source text.
    this.localeValue = this.explicitLocale
      ? this.resolveLocale(options.locale ?? this.source)
      : this.pickLocale()
  }

  private resolveLocale(locale: string): string {
    const normalized = normalizeLocale(locale)
    if (normalized === this.source) return normalized
    return matchLocale(normalized, [...this.catalogs.keys()]) ?? normalized
  }

  get locale(): string {
    return this.localeValue
  }

  get sourceLocale(): string {
    return this.source
  }

  get fallbackLocale(): string | undefined {
    return this.fallbackValue
  }

  /** Stable function reference, safe for hooks. */
  t = (source: string, params?: Record<string, unknown>, options?: TranslateOptions): string => {
    const id = messageKey(source, options?.context)
    const locale = options?.locale ? normalizeLocale(options.locale) : this.localeValue
    const message = this.lookup(id, locale)

    if (message === undefined) {
      // The source language is the ground truth: nothing to translate or report.
      if (locale === this.source) {
        return params ? formatMessage(source, params, locale) : source
      }
      this.reportMissing(source, options?.context, locale)
      // A synchronous missing handler may have filled it in already.
      const resolved = this.lookup(id, locale)
      if (resolved === undefined) {
        return params ? formatMessage(source, params, locale) : source
      }
      return options?.raw ? resolved : formatMessage(resolved, params, locale)
    }
    return options?.raw ? message : formatMessage(message, params, locale)
  }

  private lookup(id: string, locale: string): string | undefined {
    const chain: string[] = [locale]
    if (this.fallbackValue) chain.push(this.fallbackValue)

    for (const loc of chain) {
      if (loc === this.source) continue
      const catalog = this.catalogs.get(loc)
      if (!catalog) continue
      const value = catalog[id]
      // typeof check: a key like "__proto__" must never resolve to an object.
      if (typeof value === 'string' && value !== '') return value
    }
    return undefined
  }

  private reportMissing(source: string, context: string | undefined, locale: string): void {
    const key = locale + '\u0000' + messageKey(source, context)
    if (this.reported.has(key)) return
    this.reported.add(key)

    // Warn even when auto-translation is off: a silent fallback hides gaps.
    if (this.warnOnMissing) {
      const where = context ? ` (context: ${context})` : ''
      console.warn(
        `[source-i18n] missing ${locale} translation for "${source}"${where} — run "npx source-i18n sync"`,
      )
    }

    if (!this.missingHandler) return

    try {
      const result = this.missingHandler({ source, context, locale })
      if (typeof result === 'string' && result) {
        this.applyTranslation(locale, messageKey(source, context), result)
      } else if (result && typeof (result as Promise<unknown>).then === 'function') {
        ;(result as Promise<string | void>).then(
          (value) => {
            if (typeof value === 'string' && value) {
              this.applyTranslation(locale, messageKey(source, context), value)
            }
          },
          () => {
            /* dev-only service failure: keep showing the source text */
          },
        )
      }
    } catch {
      /* never break rendering because of telemetry */
    }
  }

  /** Replaces a single message at runtime (used by the dev auto-translate flow). */
  applyTranslation(locale: string, id: string, text: string): void {
    const loc = normalizeLocale(locale)
    let catalog = this.catalogs.get(loc)
    if (!catalog) {
      catalog = emptyCatalog()
      this.catalogs.set(loc, catalog)
    }
    if (catalog[id] === text) return
    if (UNSAFE_KEYS.has(id)) {
      Object.defineProperty(catalog, id, { value: text, enumerable: true, configurable: true, writable: true })
    } else {
      catalog[id] = text
    }
    this.bump()
  }

  /** Merges catalogs in, picks the initial locale, notifies subscribers. */
  register(
    catalogs: Record<string, Catalog>,
    options: { sourceLocale?: string; fallbackLocale?: string } = {},
  ): void {
    for (const [locale, messages] of Object.entries(catalogs)) {
      const loc = normalizeLocale(locale)
      const existing = this.catalogs.get(loc)
      if (existing) assignCatalog(existing, messages)
      else this.catalogs.set(loc, assignCatalog(emptyCatalog(), messages))
    }
    if (options.sourceLocale) this.source = normalizeLocale(options.sourceLocale)
    if (options.fallbackLocale) this.fallbackValue = normalizeLocale(options.fallbackLocale)
    this.localeValue = this.explicitLocale ? this.resolveLocale(this.localeValue) : this.pickLocale()
    this.reported.clear()
    this.bump()
  }

  setLocale(locale: string): void {
    const resolved = this.resolveLocale(locale)

    this.explicitLocale = true
    if (resolved === this.localeValue) return
    this.localeValue = resolved
    try {
      this.storage?.setItem(this.storageKey, resolved)
    } catch {
      /* storage can be full or disabled */
    }
    this.bump()
  }

  has(locale: string): boolean {
    return this.catalogs.has(normalizeLocale(locale))
  }

  getLocales(): string[] {
    return [this.source, ...this.catalogs.keys()]
  }

  setMissingHandler(handler: MissingHandler | undefined): void {
    this.missingHandler = handler
    this.reported.clear()
  }

  setWarnOnMissing(enabled: boolean): void {
    this.warnOnMissing = enabled
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): string => `${this.localeValue}\u0000${this.version}`

  private bump(): void {
    this.version += 1
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        /* a broken subscriber must not break the others */
      }
    }
  }

  private pickLocale(): string {
    const available = [...this.catalogs.keys()]

    const stored = (() => {
      try {
        return this.storage?.getItem(this.storageKey) ?? null
      } catch {
        return null
      }
    })()
    if (stored) {
      const match = this.matchAny(stored, available)
      if (match) return match
    }

    const preferred =
      typeof navigator !== 'undefined'
        ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
        : []
    for (const language of preferred) {
      const match = this.matchAny(language, available)
      if (match) return match
    }

    return this.fallbackValue ?? this.source
  }

  private matchAny(requested: string, available: string[]): string | undefined {
    if (normalizeLocale(requested).toLowerCase() === this.source.toLowerCase()) return this.source
    return matchLocale(requested, available)
  }
}

let singleton: I18n | undefined

/** The default instance used by the module-level `t`. */
export function getI18n(): I18n {
  if (!singleton) singleton = new I18n()
  return singleton
}

/** Replaces the default instance (useful for tests or per-request SSR). */
export function configure(options: I18nOptions = {}): I18n {
  singleton = new I18n(options)
  return singleton
}

export function createI18n(options: I18nOptions = {}): I18n {
  return new I18n(options)
}

export const t = (source: string, params?: Record<string, unknown>, options?: TranslateOptions): string =>
  getI18n().t(source, params, options)

export const setLocale = (locale: string): void => getI18n().setLocale(locale)
export const getLocale = (): string => getI18n().locale
export const subscribe = (listener: () => void): (() => void) => getI18n().subscribe(listener)
export const getSnapshot = (): string => getI18n().getSnapshot()

export function registerCatalogs(
  catalogs: Record<string, Catalog>,
  options?: { sourceLocale?: string; fallbackLocale?: string },
): void {
  getI18n().register(catalogs, options)
}

export function setMissingHandler(handler: MissingHandler | undefined): void {
  getI18n().setMissingHandler(handler)
}

/** Enabled by the dev plugin; production builds never warn. */
export function setWarnOnMissing(enabled: boolean): void {
  getI18n().setWarnOnMissing(enabled)
}

export function applyTranslation(locale: string, id: string, text: string): void {
  getI18n().applyTranslation(locale, id, text)
}
