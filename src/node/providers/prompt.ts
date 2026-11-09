import { assertValidMessage, placeholdersOf } from '../../format.js'
import type { TranslateRequest } from '../../types.js'

const LANGUAGE_NAMES: Record<string, string> = {
  zh: 'Chinese',
  'zh-cn': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  'zh-hk': 'Traditional Chinese (Hong Kong)',
  en: 'English',
  'en-us': 'American English',
  'en-gb': 'British English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  'pt-br': 'Brazilian Portuguese',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  ar: 'Arabic',
  hi: 'Hindi',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  nb: 'Norwegian',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  bn: 'Bengali',
  fa: 'Persian',
}

export function languageName(locale: string): string {
  const key = locale.toLowerCase()
  return LANGUAGE_NAMES[key] ?? LANGUAGE_NAMES[key.split('-')[0] ?? ''] ?? locale
}

/**
 * Whether the target language actually distinguishes plural forms.
 * Chinese, Japanese, Korean, Thai, Vietnamese… have a single form, so asking
 * a model for ICU plurals there produces unnatural or broken output.
 */
export function pluralCategories(locale: string): string[] {
  try {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  } catch {
    return ['one', 'other']
  }
}

export interface PluralSpec {
  placeholder: string
  categories: string[]
}

/**
 * Strings with a single numeric placeholder (e.g. "{count} files") are sent as
 * plural items: the model fills one slot per plural category and we assemble
 * the ICU message ourselves. Small models are much more reliable that way than
 * when asked to emit ICU syntax directly.
 *
 * Which placeholders hold numbers is project configuration
 * (`plural.placeholders`), not a built-in list of names: `{inputs}` is just as
 * valid as `{count}`.
 */
export function pluralSpecs(req: TranslateRequest): Record<number, PluralSpec> {
  const categories = pluralCategories(req.to)
  if (categories.length < 2) return {}
  const numericNames = new Set(req.pluralPlaceholders ?? ['count'])

  const specs: Record<number, PluralSpec> = {}
  req.items.forEach((item, index) => {
    // Other placeholders may appear in the same sentence ({name} and {count});
    // only the single numeric one drives the plural categories.
    const numeric = placeholdersOf(item.text).filter((name) => numericNames.has(name))
    if (numeric.length !== 1) return
    specs[index] = { placeholder: numeric[0]!, categories }
  })
  return specs
}

export function systemPrompt(req: TranslateRequest): string {
  const from = languageName(req.from)
  const to = languageName(req.to)
  const categories = pluralCategories(req.to)
  const hasPlural = categories.length > 1

  const pluralSection = hasPlural
    ? [
        `- ${to} distinguishes plural forms (${categories.join(', ')}).`,
        '- Items containing exactly one numeric placeholder are sent with "plural": {"placeholder":"count","categories":[...]}.',
        '- For those items do not return "text". Return one field per category instead:',
        '  {"i":3,"one":"# file","other":"# files"}',
        '- Use "#" for the number inside each sentence. We build the ICU message for you.',
      ].join('\n')
    : [
        `- ${to} has a single plural form, so plurals are never used.`,
        '- Write the number placeholder directly in a natural sentence.',
        '- Shape only: "Exported {count} files" -> "Exportiert {count} Dateien"',
      ].join('\n')

  const glossary =
    req.glossary && Object.keys(req.glossary).length
      ? Object.entries(req.glossary)
          .map(([term, value]) => `- ${term} -> ${value}`)
          .join('\n')
      : '- none'

  return [
    `You are a professional software localization engine. Translate UI strings from ${from} to ${to}.`,
    '',
    'OUTPUT FORMAT',
    'Return exactly one JSON object and nothing else — no markdown fence, no comments, no explanation:',
    '{"translations":[{"i":0,"text":"..."},{"i":1,"text":"..."}]}',
    '- One entry per input index, in the same order, with the same "i" values.',
    '- "text" must be a plain UTF-8 string. Never return null or an object.',
    '',
    'RULES',
    '1. Keep every placeholder exactly as written: {name}, {count}, {user.id}. Never rename, translate or drop them.',
    '2. Keep ICU syntax valid: braces, commas and keywords (plural, select, one, other, #) must not change.',
    '3. Translate the meaning into wording a native UI would use — not word by word.',
    '4. Do not translate: code, file paths, URLs, emails, keyboard shortcuts (Ctrl+S), version numbers, or glossary terms.',
    '5. Preserve leading/trailing spaces and trailing colons/ellipsis from the source. Do not add a trailing period or punctuation the source does not have.',
    '6. Keep buttons and menu items short; never add explanatory words.',
    '7. If a string has nothing translatable (e.g. "OK", "100%", "v2"), return it unchanged.',
    '8. Never merge, split or reorder strings, even if two inputs are similar.',
    '',
    'PLURALS',
    pluralSection,
    '',
    'CONTEXT',
    '- An item may include "context" (where it appears) and "role" (button, menu, tooltip, error).',
    '- Use them to pick the right word, but never include them in the output.',
    '',
    'GLOSSARY (keep these terms exactly as shown)',
    glossary,
    '',
    'Return only the JSON object now.',
  ].join('\n')
}

export function userPrompt(req: TranslateRequest): string {
  const specs = pluralSpecs(req)
  const strings = req.items.map((item, index) => ({
    i: index,
    text: item.text,
    ...(specs[index] ? { plural: specs[index] } : {}),
    ...(item.context ? { context: item.context } : {}),
    ...(item.role ? { role: item.role } : {}),
    ...(item.maxLength ? { maxLength: item.maxLength } : {}),
  }))

  return JSON.stringify(
    {
      sourceLocale: req.from,
      targetLocale: req.to,
      ...(req.glossary && Object.keys(req.glossary).length ? { glossary: req.glossary } : {}),
      strings,
    },
    null,
    2,
  )
}

function normalizePluralBody(value: string): string {
  let body = value.replace(/\r?\n/g, ' ').trim()
  // Models sometimes echo ICU braces into the slot ("{# file}").
  if (body.startsWith('{') && body.endsWith('}')) body = body.slice(1, -1).trim()
  return body
}

/** Assembles a valid ICU plural message from the model's per-category slots. */
export function composePlural(entry: Record<string, unknown>, spec: PluralSpec): string | undefined {
  const bodies: string[] = []
  for (const category of spec.categories) {
    const value = entry[category]
    if (typeof value === 'string' && value.trim()) {
      bodies.push(`${category} {${normalizePluralBody(value)}}`)
    }
  }

  if (!bodies.some((body) => body.startsWith('other '))) {
    const fallback =
      typeof entry.other === 'string'
        ? entry.other
        : typeof entry.text === 'string'
          ? entry.text
          : undefined
    if (fallback && fallback.trim()) bodies.push(`other {${normalizePluralBody(fallback)}}`)
  }

  if (bodies.length === 0) return undefined
  return `{${spec.placeholder}, plural, ${bodies.join(' ')}}`
}

/**
 * Extracts translations from a model reply, tolerating fenced JSON.
 * Items with plural specs may come back as one slot per category; those are
 * assembled into ICU here instead of trusting the model to write ICU itself.
 */
export function parseTranslations(
  raw: string,
  specs: Record<number, PluralSpec> = {},
): Record<number, string> {
  let text = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/.exec(text)
  if (fence) text = fence[1]!.trim()

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last <= first) throw new Error('model reply did not contain JSON')

  const parsed = JSON.parse(text.slice(first, last + 1)) as unknown
  const container = parsed as Record<string, unknown>
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(container.translations)
      ? container.translations
      : Array.isArray(container.results)
        ? container.results
        : []

  const out: Record<number, string> = {}
  for (const entry of list as Record<string, unknown>[]) {
    const index = Number(entry.i ?? entry.index ?? entry.id)
    if (!Number.isInteger(index)) continue

    const spec = specs[index]
    if (spec && spec.categories.some((category) => typeof entry[category] === 'string' && String(entry[category]).trim())) {
      const composed = composePlural(entry, spec)
      if (composed) {
        try {
          assertValidMessage(composed)
          out[index] = composed
          continue
        } catch {
          // Fall through to "text" (or let the caller report the item as failed).
        }
      }
    }

    const value = entry.text ?? entry.translation ?? entry.output
    if (typeof value === 'string') out[index] = value
  }

  if (Object.keys(out).length === 0) throw new Error('model reply contained no translations')
  return out
}
