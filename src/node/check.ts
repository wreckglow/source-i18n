import { placeholdersOf } from '../format.js'
import type { ResolvedConfig } from '../types.js'
import { metaPath } from './catalog-io.js'
import { collectSources } from './sources.js'
import { isUntouchedMachine, readMeta } from './meta.js'
import { catalogPath, readCatalog } from './sync.js'
import { validateTranslation } from './validate.js'

export interface CheckIssue {
  id: string
  source: string
  translation: string
  kind: string
  detail?: string
}

export interface LocaleCheck {
  locale: string
  total: number
  missing: { id: string; source: string; file: string; line: number }[]
  invalid: CheckIssue[]
  /** Informational: brand names and terms that legitimately stay identical. */
  identical: { id: string; source: string; translation: string }[]
  /** Machine translations whose source string disappeared. */
  unused: string[]
  /** Hand-added entries whose source string is gone. Advisory: prune keeps them by default. */
  manual: string[]
}

export interface CheckReport {
  sources: number
  files: number
  locales: LocaleCheck[]
  dynamic: { file: string; line: number }[]
  skipped: { file: string; reason: string }[]
  /** Short, context-free source strings that are easy to mistranslate. Advisory. */
  short: { id: string; source: string }[]
  /** Strings with more than one numeric placeholder: ICU plurals are not generated. */
  plural: { id: string; source: string; placeholders: string[] }[]
  ok: boolean
  strict: boolean
}

export interface CheckOptions {
  root: string
  config: ResolvedConfig
  locales?: string[]
  strict?: boolean
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

function isCjkLocale(locale: string): boolean {
  return ['zh', 'ja', 'ko'].includes(locale.toLowerCase().split('-')[0] ?? '')
}

function looksLikeForeignIdentical(source: string, locale: string): boolean {
  // A Chinese/Japanese/Korean sentence copied verbatim into a Latin/Cyrillic/
  // Arabic target is a broken translation, not a brand name.
  return CJK.test(source) && !isCjkLocale(locale)
}

/** CI gate: fails on missing strings and on translations that would break at runtime. */
export function checkProject(options: CheckOptions): CheckReport {
  const { root, config } = options
  const index = collectSources(root, config)
  const locales = options.locales?.length ? options.locales : config.locales
  const strict = options.strict === true

  const short: CheckReport['short'] = []
  const plural: CheckReport['plural'] = []
  for (const message of index.messages.values()) {
    const length = [...message.source].length
    if (length <= 3 && CJK.test(message.source) && !message.source.includes('{')) {
      short.push({ id: message.id, source: message.source })
    }
    const numeric = placeholdersOf(message.source).filter((name) =>
      config.plural.placeholders.includes(name),
    )
    if (numeric.length > 1) {
      plural.push({ id: message.id, source: message.source, placeholders: numeric })
    }
  }

  const report: CheckReport = {
    sources: index.messages.size,
    files: index.files,
    locales: [],
    dynamic: index.dynamic,
    skipped: index.skipped,
    short,
    plural,
    ok: true,
    strict,
  }

  for (const locale of locales) {
    const catalog = readCatalog(catalogPath(root, config, locale), locale)
    const meta = readMeta(metaPath(root, config, locale))
    const result: LocaleCheck = {
      locale,
      total: index.messages.size,
      missing: [],
      invalid: [],
      identical: [],
      unused: [],
      manual: [],
    }

    for (const [id, message] of index.messages) {
      const translation = catalog[id]
      if (translation === undefined) {
        result.missing.push({ id, source: message.source, file: message.file, line: message.line })
        continue
      }

      const issue = validateTranslation(message.source, translation)
      if (issue?.blocking) {
        result.invalid.push({
          id,
          source: message.source,
          translation,
          kind: issue.kind,
          detail: issue.detail,
        })
      } else if (issue?.kind === 'identical') {
        if (looksLikeForeignIdentical(message.source, locale)) {
          // The source script does not belong to the target language: a failed
          // translation, not a brand name.
          result.invalid.push({
            id,
            source: message.source,
            translation,
            kind: 'untranslated-script',
            detail: 'identical to the source, but the target language does not use these characters',
          })
        } else {
          result.identical.push({ id, source: message.source, translation })
        }
      }
    }

    for (const [id, translation] of Object.entries(catalog)) {
      if (index.messages.has(id)) continue
      // Only a translation we know the machine produced and nobody edited is
      // provably stale. Manual entries (no provenance record, or an edited
      // fingerprint) may exist for dynamic strings and are left alone.
      if (isUntouchedMachine(meta, id, translation)) result.unused.push(id)
      else result.manual.push(id)
    }

    if (result.missing.length > 0 || result.invalid.length > 0) report.ok = false
    if (strict && result.unused.length > 0) report.ok = false

    report.locales.push(result)
  }

  // A dynamic t() call can never be extracted; --strict treats it as an error
  // so new pages cannot silently ship untranslatable strings.
  if (strict && index.dynamic.length > 0) report.ok = false

  return report
}
