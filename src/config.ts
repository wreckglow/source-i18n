import { normalizeLocale } from './format.js'
import type { Config, ResolvedConfig } from './types.js'

export const DEFAULT_CATALOGS = 'i18n/locales'

export const DEFAULT_INCLUDE = [
  'src',
  'app',
  'pages',
  'components',
  'lib',
  'electron',
  'renderer',
  'website',
  'client',
]

export const DEFAULT_EXCLUDE = [
  'node_modules',
  'dist',
  'build',
  'out',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  'vendor',
  '.turbo',
  '__snapshots__',
]

/** Identity helper that gives config files autocomplete. */
export function defineConfig(config: Config): Config {
  return config
}

const LOCALE_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/

function assertLocale(tag: string, field: string): string {
  const normalized = normalizeLocale(tag)
  // Locale tags end up in file names; keep them from escaping the catalog directory.
  if (!LOCALE_RE.test(normalized)) {
    throw new Error(`source-i18n: invalid ${field} locale tag ${JSON.stringify(tag)}`)
  }
  return normalized
}

function normalizePlaceholders(value: unknown): string[] {
  if (value === undefined) return ['count']
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('source-i18n: config.plural.placeholders must be an array of placeholder names')
  }
  return [...new Set(value.map((entry) => (entry as string).trim()).filter(Boolean))]
}

export function resolveConfig(config: Config, root: string): ResolvedConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('source-i18n: missing configuration')
  }
  if (!config.source) {
    throw new Error('source-i18n: config.source is required, e.g. source: "zh-CN"')
  }
  if (!Array.isArray(config.locales) || config.locales.length === 0) {
    throw new Error('source-i18n: config.locales must list at least one target locale')
  }

  return {
    ...config,
    root,
    // Locale tags are normalised once, so "zh_cn" and "zh-CN" never coexist.
    source: assertLocale(config.source, 'source'),
    locales: [...new Set(config.locales.map((locale) => assertLocale(locale, 'target')))],
    catalogs: config.catalogs ?? DEFAULT_CATALOGS,
    glossary: config.glossary ?? {},
    extract: {
      include: config.extract?.include ?? DEFAULT_INCLUDE,
      exclude: config.extract?.exclude ?? DEFAULT_EXCLUDE,
      functions: config.extract?.functions ?? ['t', '$t'],
      requireImport: config.extract?.requireImport ?? true,
    },
    plural: {
      placeholders: normalizePlaceholders(config.plural?.placeholders),
    },
    provenance: config.provenance ?? true,
    providerTimeout: config.providerTimeout ?? 60_000,
    dev: {
      // Opt-in: dev auto-translation sends source strings to the provider.
      autoTranslate: config.dev?.autoTranslate ?? false,
      writeBack: config.dev?.writeBack ?? true,
    },
    check: {
      onBuild: normalizeOnBuild(config.check?.onBuild),
      strict: config.check?.strict ?? true,
    },
  }
}

function normalizeOnBuild(value: unknown): 'off' | 'warn' | 'error' {
  if (value === undefined) return 'off'
  if (value === 'off' || value === 'warn' || value === 'error') return value
  throw new Error('source-i18n: config.check.onBuild must be "off", "warn" or "error"')
}
