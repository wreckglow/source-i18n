/**
 * A tiny ICU MessageFormat-compatible formatter.
 *
 * Supported:
 *   {name}
 *   {n, number} / {n, number, percent|integer|compact|currency:USD}
 *   {d, date} / {d, date, short|medium|long|full}
 *   {d, time} / {d, time, short|medium|long|full}
 *   {n, plural, offset:1 one {...} other {...}}   (+ # placeholder)
 *   {n, selectordinal, ...}
 *   {v, select, male {...} other {...}}
 *   ' quoting: '' -> ', '{' -> {, '}' -> }, '#' -> #
 *
 * Anything malformed falls back to the raw template at runtime, so a broken
 * translation can never crash the UI.
 */

export class MessageSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MessageSyntaxError'
  }
}

export type FormatParams = Record<string, unknown>

type Node =
  | { t: 'text'; v: string }
  | { t: 'arg'; name: string }
  | { t: 'fn'; name: string; fn: 'number' | 'date' | 'time'; style?: string }
  | {
      t: 'plural'
      name: string
      ordinal: boolean
      offset: number
      options: Record<string, Node[]>
    }
  | { t: 'select'; name: string; options: Record<string, Node[]> }
  | { t: 'pound' }

const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'
const isDigit = (c: string) => c >= '0' && c <= '9'
const isIdent = (c: string) =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || isDigit(c) || c === '_' || c === '$' || c === '-'

class Parser {
  private i = 0

  constructor(private readonly src: string) {}

  parse(): Node[] {
    const nodes = this.parseNodes(false)
    if (this.i < this.src.length) {
      throw new MessageSyntaxError(`Unexpected "${this.src[this.i]}" at ${this.i}`)
    }
    return nodes
  }

  /** Parses nodes until the closing "}" of an option body, or to the end. */
  private parseNodes(inOption: boolean): Node[] {
    const nodes: Node[] = []
    let text = ''
    const flush = () => {
      if (text) {
        nodes.push({ t: 'text', v: text })
        text = ''
      }
    }

    while (this.i < this.src.length) {
      const c = this.src[this.i]!

      if (c === '}' && inOption) {
        flush()
        return nodes
      }
      if (c === "'") {
        const next = this.src[this.i + 1]
        if (next === "'") {
          text += "'"
          this.i += 2
          continue
        }
        if (next === '{' || next === '}' || next === '#') {
          // ICU quoting: everything up to the next apostrophe is literal.
          const end = this.src.indexOf("'", this.i + 1)
          if (end === -1) {
            text += this.src.slice(this.i + 1)
            this.i = this.src.length
          } else {
            text += this.src.slice(this.i + 1, end)
            this.i = end + 1
          }
          continue
        }
        text += c
        this.i += 1
        continue
      }
      if (c === '{') {
        flush()
        this.i += 1
        nodes.push(this.parseArg())
        continue
      }
      if (c === '}') {
        throw new MessageSyntaxError(`Unmatched "}" at ${this.i}`)
      }
      if (c === '#') {
        flush()
        nodes.push({ t: 'pound' })
        this.i += 1
        continue
      }
      text += c
      this.i += 1
    }

    if (inOption) throw new MessageSyntaxError('Unterminated message option')
    flush()
    return nodes
  }

  private skipWs() {
    while (this.i < this.src.length && isWs(this.src[this.i]!)) this.i += 1
  }

  private readWord(): string {
    const start = this.i
    while (this.i < this.src.length && isIdent(this.src[this.i]!)) this.i += 1
    if (start === this.i) throw new MessageSyntaxError(`Expected a name at ${this.i}`)
    return this.src.slice(start, this.i)
  }

  private expect(c: string) {
    if (this.src[this.i] !== c) {
      throw new MessageSyntaxError(`Expected "${c}" at ${this.i}`)
    }
    this.i += 1
  }

  private parseArg(): Node {
    this.skipWs()
    const name = this.readWord()
    this.skipWs()

    if (this.src[this.i] === '}') {
      this.i += 1
      return { t: 'arg', name }
    }

    this.expect(',')
    this.skipWs()
    const fn = this.readWord()
    this.skipWs()

    if (fn === 'plural' || fn === 'selectordinal' || fn === 'select') {
      let offset = 0
      this.expect(',')
      this.skipWs()

      if (fn !== 'select' && this.src.startsWith('offset:', this.i)) {
        this.i += 'offset:'.length
        this.skipWs()
        const start = this.i
        if (this.src[this.i] === '-') this.i += 1
        while (this.i < this.src.length && (isDigit(this.src[this.i]!) || this.src[this.i] === '.')) {
          this.i += 1
        }
        offset = Number(this.src.slice(start, this.i))
        if (!Number.isFinite(offset)) throw new MessageSyntaxError('Invalid plural offset')
        this.skipWs()
        if (this.src[this.i] === ',') {
          this.i += 1
          this.skipWs()
        }
      }

      const options: Record<string, Node[]> = {}
      for (;;) {
        this.skipWs()
        if (this.i >= this.src.length) throw new MessageSyntaxError('Unterminated plural/select')
        if (this.src[this.i] === '}') {
          this.i += 1
          break
        }
        const start = this.i
        while (this.i < this.src.length && this.src[this.i] !== '{' && !isWs(this.src[this.i]!)) {
          this.i += 1
        }
        const selector = this.src.slice(start, this.i)
        if (!selector) throw new MessageSyntaxError(`Expected a selector at ${this.i}`)
        this.skipWs()
        this.expect('{')
        const body = this.parseNodes(true)
        this.expect('}')
        options[selector] = body
      }

      if (fn === 'select') return { t: 'select', name, options }
      return { t: 'plural', name, ordinal: fn === 'selectordinal', offset, options }
    }

    if (fn === 'number' || fn === 'date' || fn === 'time') {
      let style: string | undefined
      if (this.src[this.i] === ',') {
        this.i += 1
        const start = this.i
        while (this.i < this.src.length && this.src[this.i] !== '}') this.i += 1
        style = this.src.slice(start, this.i).trim() || undefined
      }
      this.skipWs()
      this.expect('}')
      return { t: 'fn', name, fn, style }
    }

    throw new MessageSyntaxError(`Unsupported format "${fn}" at ${this.i}`)
  }
}

export function parseMessage(template: string): Node[] {
  return new Parser(template).parse()
}

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

const localeValidity = new Map<string, boolean>()

/**
 * A malformed tag (e.g. "en_US") makes every Intl constructor throw. Rather
 * than returning the raw template, fall back to English so placeholders still
 * get interpolated.
 */
function safeLocale(locale: string): string {
  const cached = localeValidity.get(locale)
  if (cached === true) return locale
  if (cached === false) return 'en'

  let valid = true
  try {
    Intl.NumberFormat.supportedLocalesOf([locale])
  } catch {
    valid = false
  }
  localeValidity.set(locale, valid)
  return valid ? locale : 'en'
}

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()
const pluralRules = new Map<string, Intl.PluralRules>()

function numberFormat(locale: string, style?: string): Intl.NumberFormat {
  const loc = safeLocale(locale)
  const key = loc + '|' + (style ?? '')
  let f = numberFormats.get(key)
  if (!f) {
    const opts: Intl.NumberFormatOptions = {}
    if (style === 'percent') opts.style = 'percent'
    else if (style === 'integer') opts.maximumFractionDigits = 0
    else if (style === 'compact') opts.notation = 'compact'
    else if (style?.startsWith('currency:')) {
      opts.style = 'currency'
      opts.currency = style.slice('currency:'.length).toUpperCase()
    }
    f = new Intl.NumberFormat(loc, opts)
    numberFormats.set(key, f)
  }
  return f
}

const DATE_STYLES = new Set(['short', 'medium', 'long', 'full'])

function dateFormat(locale: string, kind: 'date' | 'time', style?: string): Intl.DateTimeFormat {
  const loc = safeLocale(locale)
  const key = loc + '|' + kind + '|' + (style ?? '')
  let f = dateFormats.get(key)
  if (!f) {
    const valid = style && DATE_STYLES.has(style) ? (style as 'short') : 'medium'
    const opts: Intl.DateTimeFormatOptions =
      kind === 'date' ? { dateStyle: valid } : { timeStyle: valid }
    f = new Intl.DateTimeFormat(loc, opts)
    dateFormats.set(key, f)
  }
  return f
}

function pluralRule(locale: string, ordinal: boolean): Intl.PluralRules {
  const loc = safeLocale(locale)
  const key = loc + '|' + ordinal
  let r = pluralRules.get(key)
  if (!r) {
    r = new Intl.PluralRules(loc, ordinal ? { type: 'ordinal' } : undefined)
    pluralRules.set(key, r)
  }
  return r
}

interface EvalContext {
  pound?: string
}

function evaluate(nodes: Node[], params: FormatParams, locale: string, ctx: EvalContext): string {
  let out = ''
  for (const node of nodes) {
    switch (node.t) {
      case 'text':
        out += node.v
        break
      case 'pound':
        out += ctx.pound ?? '#'
        break
      case 'arg': {
        const v = params[node.name]
        out += v === undefined || v === null ? `{${node.name}}` : String(v)
        break
      }
      case 'fn': {
        const v = params[node.name]
        if (v === undefined || v === null) {
          out += `{${node.name}}`
          break
        }
        if (node.fn === 'number') {
          const n = Number(v)
          out += Number.isNaN(n) ? String(v) : numberFormat(locale, node.style).format(n)
        } else {
          const d = v instanceof Date ? v : new Date(v as string | number)
          if (Number.isNaN(d.getTime())) {
            out += String(v)
          } else {
            out += dateFormat(locale, node.fn, node.style).format(d)
          }
        }
        break
      }
      case 'plural': {
        const raw = Number(params[node.name])
        if (!Number.isFinite(raw)) {
          out += `{${node.name}}`
          break
        }
        const n = raw - node.offset
        // ICU: exact "=N" selectors match the original value, offset only affects
        // the plural category and the "#" placeholder.
        const exact = node.options[`=${raw}`] ?? node.options[String(raw)]
        const category = exact ? undefined : pluralRule(locale, node.ordinal).select(n)
        const body = exact ?? (category ? node.options[category] : undefined) ?? node.options.other ?? []
        out += evaluate(body, params, locale, { pound: numberFormat(locale).format(n) })
        break
      }
      case 'select': {
        const key = String(params[node.name] ?? '')
        const body = node.options[key] ?? node.options.other ?? []
        out += evaluate(body, params, locale, ctx)
        break
      }
    }
  }
  return out
}

const compiled = new Map<string, Node[]>()
const COMPILED_LIMIT = 4000

function compile(template: string, locale: string): Node[] {
  const key = locale + '\u0000' + template
  let nodes = compiled.get(key)
  if (nodes) return nodes
  nodes = parseMessage(template)
  if (compiled.size > COMPILED_LIMIT) compiled.clear()
  compiled.set(key, nodes)
  return nodes
}

/** Formats a message. Never throws: malformed templates are returned verbatim. */
export function formatMessage(template: string, params: FormatParams | undefined, locale: string): string {
  if (!params || Object.keys(params).length === 0) {
    if (!template.includes('{') && !template.includes('#')) return template
  }
  try {
    return evaluate(compile(template, locale), params ?? {}, locale, {})
  } catch {
    return template
  }
}

/** Throws when the template is malformed. Used by the validator. */
export function assertValidMessage(template: string): void {
  parseMessage(template)
}

/** Returns the placeholder names used by a template (excluding ICU keywords). */
export function placeholdersOf(template: string): string[] {
  const names = new Set<string>()
  try {
    walk(parseMessage(template), names)
  } catch {
    // best effort on malformed input
    for (const m of template.matchAll(/\{\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]!)
  }
  names.delete('plural')
  names.delete('select')
  names.delete('selectordinal')
  names.delete('number')
  names.delete('date')
  names.delete('time')
  names.delete('offset')
  return [...names].sort()
}

function walk(nodes: Node[], out: Set<string>) {
  for (const node of nodes) {
    if (node.t === 'arg' || node.t === 'fn') out.add(node.name)
    else if (node.t === 'plural') {
      out.add(node.name)
      for (const body of Object.values(node.options)) walk(body, out)
    } else if (node.t === 'select') {
      out.add(node.name)
      for (const body of Object.values(node.options)) walk(body, out)
    }
  }
}

/**
 * BCP-47 canonicalisation: "en_US" -> "en-US", "zh-hant" -> "zh-Hant".
 * Language lowercase, region uppercase, script title case.
 */
export function normalizeLocale(locale: string): string {
  const parts = locale.replace(/_/g, '-').trim().split('-').filter(Boolean)
  if (parts.length === 0) return locale.trim()

  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase()
      if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase()
      if (/^[A-Za-z]{4}$/.test(part)) return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
      return part.toLowerCase()
    })
    .join('-')
}

/** Picks the best available locale for a requested one ("en" -> "en-US"). */
export function matchLocale(requested: string, available: readonly string[]): string | undefined {
  const req = normalizeLocale(requested).toLowerCase()
  if (!req) return undefined
  for (const a of available) {
    if (normalizeLocale(a).toLowerCase() === req) return a
  }
  const base = req.split('-')[0]!
  for (const a of available) {
    if (normalizeLocale(a).toLowerCase().split('-')[0] === base) return a
  }
  return undefined
}
