/** A flat "source text -> translation" map. Keys are message ids (see messageKey). */
export type Catalog = Record<string, string>

export interface LocaleCatalogFile {
  locale: string
  sourceLocale?: string
  messages: Catalog
}

export interface TranslateItem {
  /** Message id (source text, optionally suffixed with `context`). */
  id: string
  /** Source text, without the context suffix. */
  text: string
  context?: string
  role?: string
  maxLength?: number
}

export interface TranslateRequest {
  items: TranslateItem[]
  from: string
  to: string
  glossary?: Record<string, string>
  /** Placeholder names that hold numbers. Default ["count"]. */
  pluralPlaceholders?: string[]
  /** Locale name for prompts, e.g. "English (United States)". */
  toName?: string
}

export type TranslateResult = Record<string, string>

export interface Provider {
  name: string
  translate(req: TranslateRequest, signal?: AbortSignal): Promise<TranslateResult>
}

export interface ProviderConfig {
  name: string
  apiKey?: string
  baseURL?: string
  model?: string
}

export interface Config {
  /** Locale the source strings are written in, e.g. "zh-CN". */
  source: string
  /** Locales to translate into. */
  locales: string[]
  /** Where catalogs live, relative to the project root. Default "i18n/locales". */
  catalogs?: string
  provider?: string | ProviderConfig | Provider
  glossary?: Record<string, string>
  extract?: {
    /** Directory prefixes to scan, relative to the project root. */
    include?: string[]
    /** Substrings that skip a file, e.g. "__tests__". */
    exclude?: string[]
    /** Function names treated as translation calls. Default ["t", "$t"]. */
    functions?: string[]
    /** Only scan files that import source-i18n. Default true. */
    requireImport?: boolean
  }
  plural?: {
    /**
     * Placeholder names that hold a number and should drive plural forms.
     * Default ["count"]. Add "inputs", "lines", ... when your code uses them.
     */
    placeholders?: string[]
  }
  /** Track which translations were machine generated. Default true. */
  provenance?: boolean
  /** Abort a provider request after this many milliseconds. Default 60000. */
  providerTimeout?: number
  dev?: {
    /**
     * Translate missing strings while developing. Default false: enabling it
     * sends source text to the configured provider.
     */
    autoTranslate?: boolean
    /** Persist dev translations into the catalog files. Default true. */
    writeBack?: boolean
  }
  check?: {
    /** Run `check` during production builds. Default "off". */
    onBuild?: 'off' | 'warn' | 'error'
    /** Use strict rules for the build gate (dynamic calls, stale machine entries). Default true. */
    strict?: boolean
  }
}

export interface ResolvedConfig extends Config {
  root: string
  catalogs: string
  glossary: Record<string, string>
  extract: Required<NonNullable<Config['extract']>>
  plural: { placeholders: string[] }
  provenance: boolean
  dev: Required<NonNullable<Config['dev']>>
  check: { onBuild: 'off' | 'warn' | 'error'; strict: boolean }
}
